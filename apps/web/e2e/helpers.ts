import type { APIRequestContext, Page } from '@playwright/test';

/**
 * Credentials of the seeded demo accounts. Overridable via env so a staging run
 * never depends on the local seed's password.
 */
export const E2E_USERS = {
  clubAdmin: {
    email: process.env.E2E_CLUB_ADMIN_EMAIL ?? 'admin@playslot.test',
    password: process.env.E2E_PASSWORD ?? 'Password123!',
  },
};

const API_BASE = process.env.PLAYWRIGHT_API_BASE_URL ?? 'http://localhost:3001';

/**
 * Signs in through the API and puts the session cookie in the browser context,
 * so a test starts on the page it is about rather than on the login form.
 */
export async function loginAs(
  page: Page,
  request: APIRequestContext,
  user: { email: string; password: string },
): Promise<void> {
  const res = await request.post(`${API_BASE}/auth/login`, { data: user });
  if (!res.ok()) throw new Error(`login failed for ${user.email}: ${res.status()} ${await res.text()}`);

  const cookies = await request.storageState();
  const session = cookies.cookies.filter((c) => c.name === 'playslot_session');
  if (session.length === 0) throw new Error('no session cookie returned by the API');
  await page.context().addCookies(
    session.map((c) => ({ ...c, domain: new URL(page.url() || 'http://localhost:3000').hostname, path: '/' })),
  );
}
