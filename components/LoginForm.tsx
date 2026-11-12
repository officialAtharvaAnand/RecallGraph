'use client';
import { useState, type FormEvent } from 'react';
import { api, type User } from '@/lib/api-client';

export function LoginForm({ onLogin }: { onLogin: (user: User) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api<{ user: User }>('/api/auth', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      onLogin(result.user);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="login">
      <div>
        <p className="eyebrow">OPERATIONS MEMORY</p>
        <h1>Every failure leaves a pattern.</h1>
        <p>Connect incidents, symptoms, and services to understand recurring failures.</p>
      </div>
      <form onSubmit={submit}>
        <h2>Sign in</h2>
        <label>
          Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button disabled={busy}>{busy ? 'Signing in…' : 'Open workspace'}</button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
