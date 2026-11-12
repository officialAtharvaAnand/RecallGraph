'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, type Incident, type Insights, type User } from '@/lib/api-client';
import { Header } from '@/components/Header';
import { LoginForm } from '@/components/LoginForm';
import { Dashboard } from '@/components/Dashboard';
import { IncidentFilters, type Filters } from '@/components/IncidentFilters';
import { IncidentList } from '@/components/IncidentList';
import { IncidentForm } from '@/components/IncidentForm';
import { IncidentDrawer } from '@/components/IncidentDrawer';
import { ResolveDialog } from '@/components/ResolveDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { AdminPanel } from '@/components/AdminPanel';
import { Toast } from '@/components/Toast';

const initialFilters: Filters = {
  q: '',
  status: '',
  service: '',
  minSeverity: '1',
  maxSeverity: '5',
};
type Action = { kind: 'resolve' | 'reopen' | 'delete'; incident: Incident };

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [insightError, setInsightError] = useState('');
  const [insightLoading, setInsightLoading] = useState(false);
  const [items, setItems] = useState<Incident[]>([]);
  const [total, setTotal] = useState(0);
  const [listError, setListError] = useState('');
  const [listLoading, setListLoading] = useState(false);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Incident | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState('');
  const [busyId, setBusyId] = useState('');
  const [toast, setToast] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    api<{ user: User | null }>('/api/auth')
      .then((result) => setUser(result.user))
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
    const unauthorized = () => setUser(null);
    window.addEventListener('recallgraph:unauthorized', unauthorized);
    return () => window.removeEventListener('recallgraph:unauthorized', unauthorized);
  }, []);

  const reload = useCallback(() => setRefresh((value) => value + 1), []);
  useEffect(() => {
    if (!user) return;
    let live = true;
    setInsightLoading(true);
    api<Insights>('/api/insights')
      .then((value) => {
        if (live) {
          setInsights(value);
          setInsightError('');
        }
      })
      .catch((error) => {
        if (live) setInsightError(error.message);
      })
      .finally(() => {
        if (live) setInsightLoading(false);
      });
    return () => {
      live = false;
    };
  }, [user, refresh]);

  useEffect(() => {
    if (!user) return;
    let live = true;
    const params = new URLSearchParams({ limit: '20', offset: String(offset) });
    for (const [key, value] of Object.entries(filters)) {
      if (value) params.set(key, value);
    }
    setListLoading(true);
    api<{ items: Incident[]; total: number }>(`/api/incidents?${params}`)
      .then((value) => {
        if (live) {
          setItems(value.items);
          setTotal(value.total);
          setListError('');
        }
      })
      .catch((error) => {
        if (live) setListError(error.message);
      })
      .finally(() => {
        if (live) setListLoading(false);
      });
    return () => {
      live = false;
    };
  }, [user, filters, offset, refresh]);

  async function signOut() {
    try {
      await api('/api/auth', { method: 'DELETE' });
      setUser(null);
      setSelected(null);
    } catch (error) {
      setToast((error as Error).message);
    }
  }

  async function investigate(incident: Incident) {
    setBusyId(incident.id);
    try {
      await api(`/api/incidents/${incident.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'investigating' }),
      });
      setToast('Investigation started.');
      reload();
    } catch (error) {
      setToast((error as Error).message);
    } finally {
      setBusyId('');
    }
  }

  async function finishAction(rootCause?: string, categoryId?: string) {
    if (!action) return;
    setBusyId(action.incident.id);
    try {
      if (action.kind === 'resolve') {
        await api(`/api/incidents/${action.incident.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'resolved', rootCause, categoryId }),
        });
      } else if (action.kind === 'reopen') {
        await api(`/api/incidents/${action.incident.id}/reopen`, {
          method: 'POST',
          body: JSON.stringify({ reason }),
        });
      } else {
        await api(`/api/incidents/${action.incident.id}`, { method: 'DELETE' });
      }
      setToast(
        `Incident ${action.kind === 'delete' ? 'deleted' : action.kind === 'resolve' ? 'resolved' : 'reopened'}.`,
      );
      setAction(null);
      setSelected(null);
      setReason('');
      reload();
    } catch (error) {
      setToast((error as Error).message);
    } finally {
      setBusyId('');
    }
  }

  if (checking)
    return (
      <main>
        <Header user={null} onSignOut={signOut} />
        <p className="panel">Checking session…</p>
      </main>
    );
  return (
    <main>
      <Header user={user} onSignOut={signOut} />
      {!user ? (
        <LoginForm onLogin={setUser} />
      ) : (
        <>
          <Dashboard data={insights} loading={insightLoading} error={insightError} />
          <div className="grid">
            <div>
              <IncidentFilters
                value={filters}
                services={insights?.summary ?? []}
                onChange={(value) => {
                  setFilters(value);
                  setOffset(0);
                }}
              />
              <IncidentList
                items={items}
                total={total}
                offset={offset}
                loading={listLoading}
                error={listError}
                user={user}
                busyId={busyId}
                onOffset={setOffset}
                onDetail={setSelected}
                onInvestigate={investigate}
                onResolve={(incident) => setAction({ kind: 'resolve', incident })}
                onReopen={(incident) => setAction({ kind: 'reopen', incident })}
                onDelete={(incident) => setAction({ kind: 'delete', incident })}
              />
            </div>
            <aside>
              <IncidentForm
                services={insights?.summary ?? []}
                symptoms={insights?.symptoms ?? []}
                onCreated={reload}
              />
            </aside>
          </div>
          {user.role === 'admin' && (
            <AdminPanel onUnauthorized={() => setUser(null)} onCatalogChange={reload} />
          )}
          {selected && <IncidentDrawer incident={selected} onClose={() => setSelected(null)} />}
          {action?.kind === 'resolve' && (
            <ResolveDialog
              incident={action.incident}
              categories={insights?.categories ?? []}
              busy={busyId === action.incident.id}
              onClose={() => setAction(null)}
              onResolve={finishAction}
            />
          )}
          {action && action.kind !== 'resolve' && (
            <ConfirmDialog
              title={action.kind === 'delete' ? 'Delete incident?' : 'Reopen incident?'}
              message={
                action.kind === 'delete'
                  ? 'The incident will be removed. Its audit history remains.'
                  : 'Give a reason for reopening this resolved incident.'
              }
              action={action.kind === 'delete' ? 'Delete' : 'Reopen'}
              busy={busyId === action.incident.id}
              reason={reason}
              onReason={action.kind === 'reopen' ? setReason : undefined}
              onClose={() => setAction(null)}
              onConfirm={() => finishAction()}
            />
          )}
        </>
      )}
      <Toast message={toast} onClose={() => setToast('')} />
    </main>
  );
}
