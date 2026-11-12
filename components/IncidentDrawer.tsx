'use client';
import { useEffect, useState } from 'react';
import { api, type Event, type Incident } from '@/lib/api-client';

type Similar = {
  id: string;
  title: string;
  sharedSymptoms: number;
  score: number;
  reasons: string[];
};
type GraphInsights = {
  graphAvailable: boolean;
  likelyRootCauses: { id: string; label: string; supportingIncidents: number }[];
  upstreamSuspects: { id: string; title: string; service: string; depth: number }[];
  similar: Similar[];
};

export function IncidentDrawer({ incident, onClose }: { incident: Incident; onClose: () => void }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [insights, setInsights] = useState<GraphInsights | null>(null);
  const [ranked, setRanked] = useState<Similar[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError('');
    setEvents([]);
    setInsights(null);
    setRanked([]);
    Promise.all([
      api<Event[]>(`/api/incidents/${incident.id}/events`),
      api<GraphInsights>(`/api/incidents/${incident.id}/insights`),
      api<Similar[]>(`/api/similar?id=${incident.id}`),
    ])
      .then(([eventRows, graph, matches]) => {
        if (live) {
          setEvents(eventRows);
          setInsights(graph);
          setRanked(matches);
        }
      })
      .catch((failure) => {
        if (live) setError((failure as Error).message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [incident.id]);
  return (
    <div className="drawer-backdrop" role="presentation">
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="detail-title">
        <button className="ghost close" onClick={onClose} aria-label="Close details">
          ×
        </button>
        <p className="eyebrow">INCIDENT INVESTIGATION</p>
        <h2 id="detail-title">{incident.title}</h2>
        <p>{incident.summary}</p>
        <p className="muted">
          {incident.service_name} · SEV {incident.severity} · {incident.status}
        </p>
        <div className="chips">
          {incident.symptoms.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        {incident.root_cause && (
          <p>
            <strong>Root cause:</strong> {incident.root_cause}
          </p>
        )}
        {loading && <p role="status">Loading investigation…</p>}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {!loading && insights && (
          <>
            {!insights.graphAvailable && (
              <p className="error">Graph unavailable. Audit history is still available.</p>
            )}
            <h3>Likely root causes</h3>
            {insights.likelyRootCauses.length ? (
              insights.likelyRootCauses.map((cause) => (
                <p key={cause.id}>
                  {cause.label} · {cause.supportingIncidents} supporting incidents
                </p>
              ))
            ) : (
              <p className="muted">No matching resolved history yet.</p>
            )}
            <h3>Upstream suspects</h3>
            {insights.upstreamSuspects.length ? (
              insights.upstreamSuspects.map((suspect) => (
                <p key={suspect.id}>
                  {suspect.title} · {suspect.service} · {suspect.depth} hop(s)
                </p>
              ))
            ) : (
              <p className="muted">No upstream incidents in the time window.</p>
            )}
            <h3>Similar incidents</h3>
            {ranked.length ? (
              ranked.map((match) => (
                <div className="match" key={match.id}>
                  <strong>{match.title}</strong>
                  <p>
                    {match.score}/100 · {match.sharedSymptoms} shared symptoms
                  </p>
                  <ul>
                    {match.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              ))
            ) : (
              <p className="muted">No incidents share symptoms.</p>
            )}
          </>
        )}
        <h3>Audit timeline</h3>
        {events.length ? (
          events.map((event) => (
            <p className="audit-event" key={event.id}>
              <strong>{event.event_type.replaceAll('_', ' ')}</strong>
              {' · '}
              {event.actor_email ?? 'System'}
              <br />
              <small>{new Date(event.happened_at).toLocaleString()}</small>
            </p>
          ))
        ) : (
          <p className="muted">No audit events found.</p>
        )}
      </aside>
    </div>
  );
}
