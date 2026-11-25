/**
 * Where to send someone after sign-in. `returnTo` arrives in the URL, so it is
 * untrusted: only a path on this site is accepted — never another origin
 * (`//evil.example`, `/\evil.example`) — and never the auth screens themselves,
 * which would bounce a signed-in person straight back to where they started.
 */
export function safeReturnTo(returnTo: string | undefined | null, fallback = '/'): string {
  if (!returnTo || !returnTo.startsWith('/')) return fallback;
  if (returnTo.startsWith('//') || returnTo.includes('\\')) return fallback;
  const path = returnTo.split(/[?#]/)[0] ?? '';
  if (/^\/(login|register)(\/|$)/.test(path)) return fallback;
  return returnTo;
}
