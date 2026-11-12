import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { route, validated } from '@/lib/http';
import { similarIncidents } from '@/lib/graph';
import { scoreMatch } from '@/lib/scoring';

export async function GET(request: Request) {
  return route(async () => {
    await requireUser();
    const id = validated(z.uuid(), new URL(request.url).searchParams.get('id'));
    try {
      const graphMatches = await similarIncidents(id);
      if (!graphMatches.length) return NextResponse.json([]);
      // PostgreSQL only hydrates current facts; Neo4j owns similarity and shared labels.
      const rows = (
        await pool.query(
          `SELECT candidate.id,candidate.title,candidate.status,
        candidate.root_cause,candidate.occurred_at,service.name AS service_name,
        source.service_id=candidate.service_id AS same_service,
        abs(source.severity-candidate.severity) AS severity_gap
      FROM incidents source JOIN incidents candidate ON candidate.id=ANY($2::uuid[])
      JOIN services service ON service.id=candidate.service_id WHERE source.id=$1`,
          [id, graphMatches.map((match) => match.id)],
        )
      ).rows;
      const byId = new Map(rows.map((row) => [row.id, row]));
      const ranked = graphMatches
        .flatMap((match) => {
          const row = byId.get(match.id);
          if (!row) return [];
          const scored = scoreMatch({
            sharedLabels: match.sharedLabels,
            sameService: row.same_service,
            serviceName: row.service_name,
            severityGap: Number(row.severity_gap),
            occurredAt: row.occurred_at,
          });
          return [
            {
              id: row.id,
              title: row.title,
              service: row.service_name,
              status: row.status,
              rootCause: row.root_cause,
              sharedSymptoms: match.sharedSymptoms,
              ...scored,
            },
          ];
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
      return NextResponse.json(ranked);
    } catch (error) {
      console.error('Graph similarity unavailable', error);
      // Preserve the legacy array response shape so the existing UI can render safely.
      return NextResponse.json([], { headers: { 'X-Graph-Available': 'false' } });
    }
  });
}
