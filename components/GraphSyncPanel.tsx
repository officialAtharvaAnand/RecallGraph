'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';

type Status = { pending: number; failed: number };

export function GraphSyncPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    try {
      setStatus(await api<Status>('/api/admin/graph-sync'));
      setError('');
    } catch (failure) {
      setError((failure as Error).message);
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function sync() {
    setBusy(true);
    try {
      await api('/api/admin/graph-sync', { method: 'POST' });
      await load();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h2>Graph sync</h2>
      {status ? (
        <p>
          {status.pending} pending · {status.failed} failed
        </p>
      ) : (
        <p>Loading sync status…</p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button disabled={busy} onClick={sync}>
        {busy ? 'Syncing…' : 'Sync now'}
      </button>
    </section>
  );
}
