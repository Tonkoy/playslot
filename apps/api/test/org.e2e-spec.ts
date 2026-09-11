import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/password';
import { createTestApp, resetDb, type TestApp } from './utils';

/**
 * Admin hierarchy (spec §13): a platform admin creates clubs and assigns club
 * admins; a club admin adds coaches + staff (invite new / link existing); all
 * scoped by role. Requires Postgres.
 */
describe('Org admin hierarchy (e2e)', () => {
  let ctx: TestApp;
  const password = 'Password123!';
  let platformCookie: string[];
  let clubId: number;
  let adminCookie: string[];

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDb(ctx.prisma);
    const { prisma } = ctx;
    const hash = await hashPassword(password);
    await prisma.user.create({
      data: { email: 'super@playslot.test', name: 'Super', passwordHash: hash, emailVerifiedAt: new Date(), roles: { create: [{ role: 'PLATFORM_ADMIN' }] } },
    });
    // an existing player we will later link as a coach
    await prisma.user.create({
      data: { email: 'existing@playslot.test', name: 'Existing Player', passwordHash: hash, emailVerifiedAt: new Date(), roles: { create: [{ role: 'PLAYER' }] } },
    });
    platformCookie = (
      await request(ctx.app.getHttpServer()).post('/auth/login').send({ email: 'super@playslot.test', password }).expect(200)
    ).headers['set-cookie'] as unknown as string[];
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const http = () => request(ctx.app.getHttpServer());

  it('platform admin creates a club and invites a club admin who then activates', async () => {
    const club = await http().post('/platform/clubs').set('Cookie', platformCookie).send({ name: 'New Club', city: 'Sofia', slotIntervalMin: 60 }).expect(201);
    clubId = club.body.id;
    expect(club.body.status).toBe('ACTIVE');

    const invite = await http().post(`/platform/clubs/${clubId}/admins`).set('Cookie', platformCookie).send({ email: 'boss@club.test', name: 'Club Boss' }).expect(201);
    expect(invite.body.invited).toBe(true);
    expect(invite.body.inviteLink).toContain('/auth/reset-password?token=');
    expect(ctx.mail.accountInvites.at(-1)?.to).toBe('boss@club.test');

    // the invited admin cannot log in yet, then sets a password via the invite token and can.
    await http().post('/auth/login').send({ email: 'boss@club.test', password: 'Whatever1!' }).expect(401);
    const token = new URL(invite.body.inviteLink).searchParams.get('token')!;
    await http().post('/auth/reset-password').send({ token, password: 'BossPass1!' }).expect(200);
    const login = await http().post('/auth/login').send({ email: 'boss@club.test', password: 'BossPass1!' }).expect(200);
    adminCookie = login.headers['set-cookie'] as unknown as string[];
    expect(login.body.user.roles).toContain('CLUB_ADMIN');
  });

  it('the new club admin adds a coach (invite) and links an existing user; team reflects both', async () => {
    const newCoach = await http().post(`/clubs/${clubId}/coaches`).set('Cookie', adminCookie).send({ email: 'freshcoach@club.test', name: 'Fresh Coach' }).expect(200);
    expect(newCoach.body.invited).toBe(true);

    const linked = await http().post(`/clubs/${clubId}/coaches`).set('Cookie', adminCookie).send({ email: 'existing@playslot.test' }).expect(200);
    expect(linked.body.invited).toBe(false); // existing user linked, not re-invited

    const team = await http().get(`/clubs/${clubId}/team`).set('Cookie', adminCookie).expect(200);
    expect(team.body.admins.map((m: { email: string }) => m.email)).toContain('boss@club.test');
    const coachEmails = team.body.coaches.map((m: { email: string }) => m.email);
    expect(coachEmails).toEqual(expect.arrayContaining(['freshcoach@club.test', 'existing@playslot.test']));
    const fresh = team.body.coaches.find((m: { email: string }) => m.email === 'freshcoach@club.test');
    expect(fresh.pending).toBe(true); // no password set yet
    expect(fresh.coachProfileId).toBeGreaterThan(0);
  });

  it('enforces roles: club admin can’t use platform routes; a coach can’t manage the team', async () => {
    await http().get('/platform/clubs').set('Cookie', adminCookie).expect(403);

    // the freshly-added coach activates, then is refused team management.
    const inv = ctx.mail.accountInvites.find((x) => x.to === 'freshcoach@club.test')!;
    const token = new URL(inv.link).searchParams.get('token')!;
    await http().post('/auth/reset-password').send({ token, password: 'CoachPass1!' }).expect(200);
    const coachLogin = await http().post('/auth/login').send({ email: 'freshcoach@club.test', password: 'CoachPass1!' }).expect(200);
    const coachCookie = coachLogin.headers['set-cookie'] as unknown as string[];
    await http().post(`/clubs/${clubId}/coaches`).set('Cookie', coachCookie).send({ email: 'x@y.test' }).expect(403);
  });
});
