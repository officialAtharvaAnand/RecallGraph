import { NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUser, issue, login } from '@/lib/auth';
import { HttpError, readJson, route, validated } from '@/lib/http';

type Failure = { count: number; expires: number };
// This single-process limiter is suitable for a local demo; production needs a shared store.
const failures = new Map<string, Failure>();
const credentials = z.object({ email: z.email(), password: z.string() });

export async function GET() {
  return route(async () => NextResponse.json({ user: await currentUser() }));
}

export async function POST(request: Request) {
  return route(async () => {
    const { email, password } = validated(credentials, await readJson(request));
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
    const key = `${email.toLowerCase()}|${ip}`;
    const now = Date.now();
    const failure = failures.get(key);
    if (failure && failure.expires > now && failure.count >= 5) {
      throw new HttpError(429, 'Too many sign-in attempts. Try again in 15 minutes.');
    }
    const user = await login(email, password);
    if (!user) {
      failures.set(key, {
        count: failure && failure.expires > now ? failure.count + 1 : 1,
        expires: failure && failure.expires > now ? failure.expires : now + 15 * 60_000,
      });
      throw new HttpError(401, 'Invalid credentials');
    }
    failures.delete(key);
    const response = NextResponse.json({ user });
    response.cookies.set('session', await issue(user), {
      httpOnly: true,
      sameSite: 'lax',
      secure: new URL(request.url).protocol === 'https:',
      path: '/',
      maxAge: 28_800,
    });
    return response;
  });
}

export async function DELETE() {
  return route(async () => {
    const response = NextResponse.json({ ok: true });
    response.cookies.delete('session');
    return response;
  });
}
