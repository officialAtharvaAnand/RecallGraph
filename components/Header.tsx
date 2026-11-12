import type { User } from '@/lib/api-client';

export function Header({ user, onSignOut }: { user: User | null; onSignOut: () => void }) {
  return (
    <header>
      <div className="brand">
        <span className="mark">◎</span>
        <span>RecallGraph</span>
      </div>
      <span className="tag">FAILURE INTELLIGENCE</span>
      {user && (
        <>
          <span className="role">
            {user.email} · {user.role}
          </span>
          <button className="ghost" onClick={onSignOut}>
            Sign out
          </button>
        </>
      )}
    </header>
  );
}
