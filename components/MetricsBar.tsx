import type { Service } from '@/lib/api-client';

export function MetricsBar({ services }: { services: Service[] }) {
  const total = (key: 'incident_count' | 'active_count' | 'critical_active_count') =>
    services.reduce((sum, service) => sum + Number(service[key]), 0);
  return (
    <section className="metrics" aria-label="Failure metrics">
      <div>
        <small>TOTAL INCIDENTS</small>
        <strong>{total('incident_count')}</strong>
      </div>
      <div>
        <small>ACTIVE FAILURES</small>
        <strong>{total('active_count')}</strong>
      </div>
      <div>
        <small>CRITICAL ACTIVE</small>
        <strong>{total('critical_active_count')}</strong>
      </div>
      <div>
        <small>TRACKED SERVICES</small>
        <strong>{services.length}</strong>
      </div>
    </section>
  );
}
