'use client';
import { useState, type FormEvent } from 'react';
import type { CatalogItem, Incident } from '@/lib/api-client';

export function ResolveDialog({
  incident,
  categories,
  busy,
  onClose,
  onResolve,
}: {
  incident: Incident;
  categories: CatalogItem[];
  busy: boolean;
  onClose: () => void;
  onResolve: (rootCause: string, categoryId: string) => void;
}) {
  const [rootCause, setRootCause] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [error, setError] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault();
    if (rootCause.trim().length < 3 || !categoryId) {
      setError('Select a category and enter at least 3 characters of root cause.');
      return;
    }
    onResolve(rootCause.trim(), categoryId);
  }
  return (
    <div className="overlay" role="presentation">
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="resolve-title">
        <h2 id="resolve-title">Resolve: {incident.title}</h2>
        <form onSubmit={submit}>
          <label>
            Root cause category
            <select required value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Choose a category</option>
              {categories
                .filter((item) => item.label !== 'Uncategorised')
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Confirmed root cause
            <textarea
              minLength={3}
              required
              value={rootCause}
              onChange={(e) => setRootCause(e.target.value)}
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <button type="button" className="ghost" onClick={onClose}>
              Cancel
            </button>
            <button disabled={busy}>{busy ? 'Resolving…' : 'Resolve incident'}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
