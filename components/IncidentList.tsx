import type { Incident, User } from '@/lib/api-client';
import { IncidentCard } from './IncidentCard';

export function IncidentList({
  items,
  total,
  offset,
  loading,
  error,
  user,
  busyId,
  onOffset,
  onDetail,
  onInvestigate,
  onResolve,
  onReopen,
  onDelete,
}: {
  items: Incident[];
  total: number;
  offset: number;
  loading: boolean;
  error: string;
  user: User;
  busyId: string;
  onOffset: (offset: number) => void;
  onDetail: (incident: Incident) => void;
  onInvestigate: (incident: Incident) => void;
  onResolve: (incident: Incident) => void;
  onReopen: (incident: Incident) => void;
  onDelete: (incident: Incident) => void;
}) {
  return (
    <section className="panel">
      <div className="panelhead">
        <div>
          <p className="eyebrow">INCIDENT LIBRARY</p>
          <h2>Failure history</h2>
        </div>
        <span>{total} records</span>
      </div>
      {loading && <p role="status">Loading incidents…</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!loading && !error && items.length === 0 && <p>No incidents match these filters.</p>}
      <div className="list">
        {items.map((incident) => (
          <IncidentCard
            key={incident.id}
            incident={incident}
            user={user}
            busy={busyId === incident.id}
            onDetail={() => onDetail(incident)}
            onInvestigate={() => onInvestigate(incident)}
            onResolve={() => onResolve(incident)}
            onReopen={() => onReopen(incident)}
            onDelete={() => onDelete(incident)}
          />
        ))}
      </div>
      <div className="pagination">
        <button
          disabled={offset === 0 || loading}
          onClick={() => onOffset(Math.max(0, offset - 20))}
        >
          Previous
        </button>
        <span>
          {total
            ? `${offset + 1}–${Math.min(offset + items.length, total)} of ${total}`
            : '0 records'}
        </span>
        <button disabled={offset + 20 >= total || loading} onClick={() => onOffset(offset + 20)}>
          Next
        </button>
      </div>
    </section>
  );
}
