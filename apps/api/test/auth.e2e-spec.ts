import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashToken, issueToken } from '../src/auth/tokens';
import { createTestApp, resetDb, type TestApp } from './utils';

/**
 * Phase 1 auth gate (roadmap P1): register → verify → login; password reset;
 * expired/used tokens rejected. Requires a test Postgres (see setup-e2e.ts).
 */
describe('Auth flow (e2e)', () => {
  let ctx: TestApp;
  const email = 'newplayer@playslot.test';
  const password = 'Password123!';

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDb(ctx.prisma);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const http = () => request(ctx.app.getHttpServer());

  it('registers a new player (unverified) and sends a verification email', async () => {
    const res = await http()
      .post('/auth/register')
      .send({ name: 'New Player', email, password, confirm: password, acceptTerms: true })
      .expect(201);

    expect(res.body.user.email).toBe(email);
    expect(res.body.user.emailVerified).toBe(false);
    expect(res.body.user.roles).toContain('PLAYER');
    expect(res.headers['set-cookie']?.[0]).toMatch(/playslot_session=/);
    expect(ctx.mail.verifications.at(-1)?.to).toBe(email);
  });

  it('rejects a duplicate registration', async () => {
    const res = await http()
      .post('/auth/register')
      .send({ name: 'Dup', email, password, confirm: password, acceptTerms: true })
      .expect(400);
    expect(res.body.error).toBe('validation_failed');
  });

  it('allows login before verification (browsing allowed while unverified)', async () => {
    const res = await http().post('/auth/login').send({ email, password }).expect(200);
    expect(res.body.user.email).toBe(email);
  });

  it('rejects verification with an invalid token', async () => {
    const res = await http().post('/auth/verify-email').send({ token: 'bogus' }).expect(422);
    expect(res.body.error).toBe('policy_violation');
  });

  it('verifies the email with the emailed token, and rejects reuse', async () => {
    const token = ctx.mail.lastVerificationToken();
    expect(token).not.toBe('');

    await http().post('/auth/verify-email').send({ token }).expect(200);

    const user = await ctx.prisma.user.findUnique({ where: { email } });
    expect(user?.emailVerifiedAt).not.toBeNull();

    // single-use
    await http().post('/auth/verify-email').send({ token }).expect(422);
  });

  it('rejects an expired verification token', async () => {
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email } });
    const { raw } = issueToken();
    await ctx.prisma.verificationToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(raw),
        purpose: 'EMAIL_VERIFY',
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    const res = await http().post('/auth/verify-email').send({ token: raw }).expect(422);
    expect(res.body.error).toBe('policy_violation');
  });

  it('runs the password-reset flow (invalid, then valid, then old password fails)', async () => {
    await http().post('/auth/forgot-password').send({ email }).expect(200);
    const token = ctx.mail.lastResetToken();
    expect(token).not.toBe('');

    await http().post('/auth/reset-password').send({ token: 'nope', password: 'Newpass123!' }).expect(422);

    await http().post('/auth/reset-password').send({ token, password: 'Newpass123!' }).expect(200);

    // reused reset token now fails
    await http().post('/auth/reset-password').send({ token, password: 'Another123!' }).expect(422);

    // new password works, old fails
    await http().post('/auth/login').send({ email, password: 'Newpass123!' }).expect(200);
    await http().post('/auth/login').send({ email, password }).expect(401);
  });

  it('returns the current user from the session cookie', async () => {
    const login = await http().post('/auth/login').send({ email, password: 'Newpass123!' }).expect(200);
    const cookie = login.headers['set-cookie'] as unknown as string[];
    const me = await http().get('/auth/me').set('Cookie', cookie).expect(200);
    expect(me.body.user.email).toBe(email);
    expect(me.body.user.emailVerified).toBe(true);
  });

  it('rejects /auth/me without a session', async () => {
    const res = await http().get('/auth/me').expect(401);
    expect(res.body.error).toBe('unauthenticated');
  });
});
