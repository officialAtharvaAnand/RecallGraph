import type { Service } from '@/lib/api-client';

export type Filters = {
  q: string;
  status: string;
  service: string;
  minSeverity: string;
  maxSeverity: string;
};

export function IncidentFilters({
  value,
  services,
  onChange,
}: {
  value: Filters;
  services: Service[];
  onChange: (filters: Filters) => void;
}) {
  function change(key: keyof Filters, next: string) {
    onChange({ ...value, [key]: next });
  }
  return (
    <div className="filters">
      <label>
        Search
        <input
          value={value.q}
          onChange={(e) => change('q', e.target.value)}
          placeholder="Incidents and root causes"
        />
      </label>
      <label>
        Status
        <select value={value.status} onChange={(e) => change('status', e.target.value)}>
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="investigating">Investigating</option>
          <option value="resolved">Resolved</option>
        </select>
      </label>
      <label>
        Service
        <select value={value.service} onChange={(e) => change('service', e.target.value)}>
          <option value="">All services</option>
          {services.map((service) => (
            <option key={service.service_id} value={service.service_id}>
              {service.service_name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Min severity
        <select value={value.minSeverity} onChange={(e) => change('minSeverity', e.target.value)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
      </label>
      <label>
        Max severity
        <select value={value.maxSeverity} onChange={(e) => change('maxSeverity', e.target.value)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
