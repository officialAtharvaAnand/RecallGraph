'use client';
import { useState } from 'react';
import { api, type Insights } from '@/lib/api-client';
import { MetricsBar } from './MetricsBar';

type Impact = {
  service: { id: string; name: string };
  impacted: { id: string; name: string; depth: number; recentIncidents: number }[];
  graphAvailable: boolean;
};

export function Dashboard({
  data,
  loading,
  error,
}: {
  data: Insights | null;
  loading: boolean;
  error: string;
}) {
  const [serviceId, setServiceId] = useState('');
  const [impact, setImpact] = useState<Impact | null>(null);
  const [impactError, setImpactError] = useState('');
  const [impactLoading, setImpactLoading] = useState(false);
  async function inspect(id: string) {
    setServiceId(id);
    setImpact(null);
    setImpactError('');
    if (!id) return;
    setImpactLoading(true);
    try {
      setImpact(await api<Impact>(`/api/services/${id}/blast-radius`));
    } catch (failure) {
      setImpactError((failure as Error).message);
    } finally {
      setImpactLoading(false);
    }
  }
  return (
    <>
      <section className="hero">
        <p className="eyebrow">INCIDENT COMMAND CENTER</p>
        <h1>
          See the signal
          <br />
          behind the failure.
        </h1>
        <p>Search history and trace symptoms and dependencies across services.</p>
      </section>
      {loading && (
        <p className="panel" role="status">
          Loading dashboard…
        </p>
      )}
      {error && (
        <p className="error panel" role="alert">
          {error}
        </p>
      )}
      {data && (
        <>
          <MetricsBar services={data.summary} />
          <div className="dashboard-grid">
            <section className="panel">
              <h2>Resolution analysis</h2>
              {data.resolutionStats.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Service</th>
                        <th>Category</th>
                        <th>Resolved</th>
                        <th>Average time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.resolutionStats.map((row) => (
                        <tr key={`${row.service_name}-${row.category_label}`}>
                          <td>{row.service_name}</td>
                          <td>{row.category_label}</td>
                          <td>{row.resolution_count}</td>
                          <td>{row.avg_time_to_resolve_hours.toFixed(1)} h</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p>No resolved incidents yet.</p>
              )}
            </section>
            <section className="panel">
              <h2>Recurring services · 90 days</h2>
              {data.repeat.length ? (
                data.repeat.map((row) => (
                  <p key={row.service_name}>
                    {row.service_name} · {row.failures} incidents
                  </p>
                ))
              ) : (
                <p>No recurring services yet.</p>
              )}
            </section>
            <section className="panel">
              <h2>Symptom co-occurrence</h2>
              {!data.graphAvailable && <p className="error">Graph unavailable.</p>}
              {data.symptomCooccurrence.length ? (
                data.symptomCooccurrence.map((row) => (
                  <p key={`${row.first}-${row.second}`}>
                    {row.first} + {row.second} · {row.incidents} incidents
                  </p>
                ))
              ) : (
                <p>No symptom pairs yet.</p>
              )}
            </section>
            <section className="panel">
              <h2>Blast radius</h2>
              <label>
                Source service
                <select value={serviceId} onChange={(e) => inspect(e.target.value)}>
                  <option value="">Choose a service</option>
                  {data.summary.map((service) => (
                    <option key={service.service_id} value={service.service_id}>
                      {service.service_name}
                    </option>
                  ))}
                </select>
              </label>
              {impactLoading && <p role="status">Tracing dependencies…</p>}
              {impactError && (
                <p className="error" role="alert">
                  {impactError}
                </p>
              )}
              {impact && !impact.graphAvailable && <p className="error">Graph unavailable.</p>}
              {impact &&
                impact.graphAvailable &&
                (impact.impacted.length ? (
                  impact.impacted.map((row) => (
                    <p key={row.id}>
                      {row.name} · depth {row.depth} · {row.recentIncidents} recent incidents
                    </p>
                  ))
                ) : (
                  <p>No dependent services in three hops.</p>
                ))}
            </section>
          </div>
        </>
      )}
    </>
  );
}
