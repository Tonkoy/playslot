// Server-only by construction: `next/headers` throws if imported on the client.
import { cookies } from 'next/headers';
import type { Me } from './api';

/** Must match apps/api/src/auth/auth.types.ts → SESSION_COOKIE. */
const SESSION_COOKIE = 'playslot_session';
const SERVER_BASE = process.env.API_BASE_URL ?? 'http://localhost:3001';
/** A slow API must not hold the whole page: past this, render signed-out. */
const TIMEOUT_MS = 1500;

/**
 * Who is signed in, resolved on the server so the first HTML already carries
 * the right menu and page. Without it the browser paints the signed-out
 * version, asks the API, and then swaps everything — the jump on every reload.
 *
 * Never throws: no cookie, an expired one, a slow or failing API all return
 * null, and the page falls back to asking from the browser as before.
 */
export async function getServerSession(): Promise<{ user: Me } | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const res = await fetch(`${SERVER_BASE}/api/auth/me`, {
      // The API accepts the same JWT as a bearer token (jwt-auth.guard.ts),
      // so the session travels without re-sending the browser's cookies.
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return (await res.json()) as { user: Me };
  } catch {
    return null;
  }
}
