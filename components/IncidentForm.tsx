'use client';
import { useState, type FormEvent } from 'react';
import { api, type CatalogItem, type Service } from '@/lib/api-client';

export function IncidentForm({
  services,
  symptoms,
  onCreated,
}: {
  services: Service[];
  symptoms: CatalogItem[];
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [severity, setSeverity] = useState(3);
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    const date = new Date(occurredAt);
    if (
      title.trim().length < 5 ||
      summary.trim().length < 10 ||
      !serviceId ||
      Number.isNaN(date.valueOf())
    ) {
      setError('Complete the title, summary, service, and occurrence time.');
      return;
    }
    setBusy(true);
    try {
      await api('/api/incidents', {
        method: 'POST',
        body: JSON.stringify({
          title,
          summary,
          serviceId,
          severity,
          occurredAt: date.toISOString(),
          symptoms: selected,
        }),
      });
      setTitle('');
      setSummary('');
      setSelected([]);
      onCreated();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <p className="eyebrow">CAPTURE KNOWLEDGE</p>
      <h2>Log an incident</h2>
      <form onSubmit={submit}>
        <label>
          Title
          <input
            minLength={5}
            maxLength={180}
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          Summary
          <textarea
            minLength={10}
            required
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
        </label>
        <label>
          Service
          <select required value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
            <option value="">Select service</option>
            {services.map((service) => (
              <option key={service.service_id} value={service.service_id}>
                {service.service_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Symptoms
          <select
            multiple
            value={selected}
            onChange={(e) =>
              setSelected(Array.from(e.target.selectedOptions, (option) => option.value))
            }
          >
            {symptoms.map((symptom) => (
              <option key={symptom.id} value={symptom.id}>
                {symptom.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Severity
          <select value={severity} onChange={(e) => setSeverity(Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label>
          Occurred at
          <input
            type="datetime-local"
            required
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
          />
        </label>
        <button disabled={busy}>{busy ? 'Recording…' : 'Record incident'}</button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
