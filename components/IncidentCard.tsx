import type { Incident, User } from '@/lib/api-client';

export function IncidentCard({
  incident,
  user,
  busy,
  onDetail,
  onInvestigate,
  onResolve,
  onReopen,
  onDelete,
}: {
  incident: Incident;
  user: User;
  busy: boolean;
  onDetail: () => void;
  onInvestigate: () => void;
  onResolve: () => void;
  onReopen: () => void;
  onDelete: () => void;
}) {
  return (
    <article>
      <div className="row">
        <span className="severity">SEV {incident.severity}</span>
        <span className="state">{incident.status}</span>
        <time>{new Date(incident.occurred_at).toLocaleString()}</time>
      </div>
      <h3>{incident.title}</h3>
      <p>{incident.summary}</p>
      <div className="chips">
        {incident.symptoms.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <p className="muted">
        {incident.service_name}
        {incident.category_label ? ` · ${incident.category_label}` : ''}
      </p>
      <div className="row actions">
        <button className="link" onClick={onDetail}>
          Investigate pattern
        </button>
        {incident.status === 'open' && (
          <button className="link" disabled={busy} onClick={onInvestigate}>
            Start investigating
          </button>
        )}
        {incident.status !== 'resolved' && (
          <button className="link" disabled={busy} onClick={onResolve}>
            Resolve
          </button>
        )}
        {user.role === 'admin' && incident.status === 'resolved' && (
          <button className="link" disabled={busy} onClick={onReopen}>
            Reopen
          </button>
        )}
        {user.role === 'admin' && (
          <button className="link danger" disabled={busy} onClick={onDelete}>
            Delete
          </button>
        )}
      </div>
    </article>
  );
}
