import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { pool } from './db';
import { HttpError } from './http';

export type Identity = {
  id: string;
  email: string;
  role: 'admin' | 'analyst';
  tokenVersion: number;
};

// A valid bcrypt hash gives nonexistent users approximately the same work as bad passwords.
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEeO7qN9Z9ISuV7lidhraNEnNh4tW7x1YzS';

function secret(): Uint8Array {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
  return new TextEncoder().encode(value);
}

export async function login(email: string, password: string): Promise<Identity | null> {
  const result = await pool.query(
    'SELECT id,email,role,password_hash,token_version FROM users WHERE email=$1',
    [email.toLowerCase()],
  );
  const row = result.rows[0];
  const matches = await bcrypt.compare(password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !matches) return null;
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    tokenVersion: row.token_version,
  };
}

export async function issue(user: Identity): Promise<string> {
  return new SignJWT(user)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(secret());
}

export async function currentUser(): Promise<Identity | null> {
  const token = (await cookies()).get('session')?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.id !== 'string' || !Number.isInteger(payload.tokenVersion)) return null;
    // Recheck role and version on every request so demotions and revocations take effect now.
    const result = await pool.query('SELECT id,email,role,token_version FROM users WHERE id=$1', [
      payload.id,
    ]);
    const row = result.rows[0];
    if (!row || row.token_version !== payload.tokenVersion) return null;
    return {
      id: row.id,
      email: row.email,
      role: row.role,
      tokenVersion: row.token_version,
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes('JWT_SECRET')) throw error;
    return null;
  }
}

export async function requireUser(role?: Identity['role']): Promise<Identity> {
  const user = await currentUser();
  if (!user) throw new HttpError(401, 'Unauthorized');
  if (role && user.role !== role) throw new HttpError(403, 'Admin required');
  return user;
}
