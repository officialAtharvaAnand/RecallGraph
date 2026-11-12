'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { api, type AdminData } from '@/lib/api-client';
import { UsersPanel } from './UsersPanel';
import { GraphSyncPanel } from './GraphSyncPanel';

export function AdminPanel({
  onUnauthorized,
  onCatalogChange,
}: {
  onUnauthorized: () => void;
  onCatalogChange: () => void;
}) {
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [service, setService] = useState({ name: '', ownerTeam: '' });
  const [symptom, setSymptom] = useState('');
  const [category, setCategory] = useState('');
  const [dependent, setDependent] = useState('');
  const [upstream, setUpstream] = useState('');

  async function load() {
    setLoading(true);
    try {
      setData(await api<AdminData>('/api/admin'));
      setError('');
    } catch (failure) {
      if ((failure as { status?: number }).status === 401) onUnauthorized();
      setError((failure as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function mutate(method: 'POST' | 'DELETE', value: unknown) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api('/api/admin', { method, body: JSON.stringify(value) });
      setMessage(method === 'POST' ? 'Added successfully.' : 'Dependency removed.');
      await load();
      onCatalogChange();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function submit(event: FormEvent, value: unknown) {
    event.preventDefault();
    void mutate('POST', value);
  }
  return (
    <section className="admin-area">
      <p className="eyebrow">ADMIN ONLY</p>
      <h2>Catalog, access, and audit</h2>
      {loading && <p role="status">Loading catalog…</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <div className="dashboard-grid">
        <section className="panel">
          <h2>Services</h2>
          <form onSubmit={(e) => submit(e, { kind: 'service', ...service })}>
            <label>
              Name
              <input
                minLength={2}
                required
                value={service.name}
                onChange={(e) => setService({ ...service, name: e.target.value })}
              />
            </label>
            <label>
              Owner team
              <input
                minLength={2}
                required
                value={service.ownerTeam}
                onChange={(e) => setService({ ...service, ownerTeam: e.target.value })}
              />
            </label>
            <button disabled={busy}>Add service</button>
          </form>
          <p className="muted">{data?.services.length ?? 0} tracked services</p>
        </section>
        <section className="panel">
          <h2>Symptoms</h2>
          <form onSubmit={(e) => submit(e, { kind: 'symptom', label: symptom })}>
            <label>
              Label
              <input
                minLength={3}
                required
                value={symptom}
                onChange={(e) => setSymptom(e.target.value)}
              />
            </label>
            <button disabled={busy}>Add symptom</button>
          </form>
          <p className="muted">{data?.symptoms.length ?? 0} symptoms</p>
        </section>
        <section className="panel">
          <h2>Root cause categories</h2>
          <form onSubmit={(e) => submit(e, { kind: 'rootCause', label: category })}>
            <label>
              Label
              <input
                minLength={3}
                required
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </label>
            <button disabled={busy}>Add category</button>
          </form>
          <p className="muted">{data?.categories.length ?? 0} categories</p>
        </section>
        <section className="panel">
          <h2>Service dependencies</h2>
          <form
            onSubmit={(e) =>
              submit(e, {
                kind: 'dependency',
                serviceId: dependent,
                dependsOnServiceId: upstream,
              })
            }
          >
            <label>
              Dependent service
              <select required value={dependent} onChange={(e) => setDependent(e.target.value)}>
                <option value="">Choose service</option>
                {data?.services.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Depends on
              <select required value={upstream} onChange={(e) => setUpstream(e.target.value)}>
                <option value="">Choose upstream</option>
                {data?.services.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <button disabled={busy}>Add dependency</button>
          </form>
          {data?.dependencies.map((edge) => (
            <p key={`${edge.service_id}-${edge.depends_on_service_id}`}>
              {data.services.find((item) => item.id === edge.service_id)?.name} →{' '}
              {data.services.find((item) => item.id === edge.depends_on_service_id)?.name}
              <button
                className="link danger"
                disabled={busy}
                onClick={() =>
                  mutate('DELETE', {
                    kind: 'dependency',
                    serviceId: edge.service_id,
                    dependsOnServiceId: edge.depends_on_service_id,
                  })
                }
              >
                Remove
              </button>
            </p>
          ))}
        </section>
      </div>
      <UsersPanel onUnauthorized={onUnauthorized} />
      <GraphSyncPanel />
      <section className="panel">
        <h2>Recent audit log</h2>
        {data?.events.length ? (
          data.events.map((event) => (
            <p className="audit-event" key={event.id}>
              <strong>{event.event_type.replaceAll('_', ' ')}</strong>
              {' · '}
              {event.incident_title} · {event.actor_email ?? 'System'}
              <br />
              <small>{new Date(event.happened_at).toLocaleString()}</small>
            </p>
          ))
        ) : (
          <p>No events yet.</p>
        )}
      </section>
    </section>
  );
}
