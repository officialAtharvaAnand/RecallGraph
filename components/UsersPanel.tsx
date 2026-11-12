'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { api, type User } from '@/lib/api-client';

type ListedUser = Pick<User, 'id' | 'email' | 'role'> & { created_at: string };

export function UsersPanel({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [users, setUsers] = useState<ListedUser[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'analyst'>('analyst');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  async function load() {
    try {
      setUsers(await api<ListedUser[]>('/api/admin/users'));
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
  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({ email, password, role }),
      });
      setEmail('');
      setPassword('');
      await load();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function changeRole(id: string, next: 'admin' | 'analyst') {
    setBusy(true);
    setError('');
    try {
      await api(`/api/admin/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: next }),
      });
      await load();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h2>Users and roles</h2>
      {loading && <p role="status">Loading users…</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <form onSubmit={create}>
        <label>
          Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Temporary password
          <input
            type="password"
            minLength={10}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label>
          Role
          <select value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'analyst')}>
            <option value="analyst">Analyst</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <button disabled={busy}>Create user</button>
      </form>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Created</th>
              <th>Change role</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.email}</td>
                <td>{user.role}</td>
                <td>{new Date(user.created_at).toLocaleDateString()}</td>
                <td>
                  <select
                    aria-label={`Role for ${user.email}`}
                    disabled={busy}
                    value={user.role}
                    onChange={(e) => changeRole(user.id, e.target.value as 'admin' | 'analyst')}
                  >
                    <option value="analyst">Analyst</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
