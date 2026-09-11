import { formatInZone } from '@playslot/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/password';
import { createTestApp, resetDb, type TestApp } from './utils';

/**
 * Coach-hosted group sessions (spec §10/§22): creation reserves the coach + a
 * court (no double-booking), invites subscribed players, and players register up
 * to capacity. Requires Postgres.
 */
describe('Group sessions (e2e)', () => {
  let ctx: TestApp;
  const tz = 'Europe/Sofia';
  const password = 'Password123!';
  let clubId: number;
  let courtId: number;
  let coachProfileId: number;
  let coachCookie: string[];
  let p1Cookie: string[];
  let p2Cookie: string[];
  let p3Cookie: string[];
  const DAY = formatInZone(new Date(Date.now() + 2 * 86_400_000), tz, 'yyyy-MM-dd');
  let sessionId: number;
  let slotStart: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDb(ctx.prisma);
    const { prisma } = ctx;
    const city = await prisma.city.create({ data: { name: 'Sofia' } });
    const hash = await hashPassword(password);
    const hours = { create: Array.from({ length: 7 }, (_, weekday) => ({ weekday, startMin: 420, endMin: 1320 })) };

    const club = await prisma.club.create({
      data: { slug: 'gs-club', name: 'GS Club', address: 'x', cityId: city.id, status: 'ACTIVE', currency: 'EUR', timezone: tz, slotIntervalMin: 60 },
    });
    clubId = club.id;
    const court = await prisma.resource.create({
      data: { clubId, type: 'COURT', name: 'Court 1', sport: 'TENNIS', minReservationMin: 60, slotIntervalMin: 60, availabilityRules: hours },
    });
    courtId = court.id;
    await prisma.priceRule.create({ data: { clubId, priceCents: 3000, currency: 'EUR', durationMin: 60, priority: 0 } });

    const coachUser = await prisma.user.create({
      data: { email: 'gs-coach@playslot.test', name: 'Coach GS', passwordHash: hash, emailVerifiedAt: new Date(), timezone: tz, roles: { create: [{ role: 'COACH' }] } },
    });
    const profile = await prisma.coachProfile.create({ data: { userId: coachUser.id, languages: ['bg'], levels: ['beginner'] } });
    coachProfileId = profile.id;
    await prisma.resource.create({
      data: {
        clubId: null, type: 'COACH', name: 'Coach GS', coachProfileId: profile.id, minReservationMin: 60, slotIntervalMin: 60,
        availabilityRules: { create: Array.from({ length: 7 }, (_, weekday) => ({ weekday, startMin: 540, endMin: 1260 })) },
      },
    });
    await prisma.coachClub.create({ data: { coachProfileId: profile.id, clubId } });

    // p1 subscribed, p2 NOT subscribed, p3 subscribed.
    for (const [email, subscribed] of [['gs-p1@playslot.test', true], ['gs-p2@playslot.test', false], ['gs-p3@playslot.test', true]] as const) {
      await prisma.user.create({
        data: { email, name: email, passwordHash: hash, emailVerifiedAt: new Date(), subscribed, roles: { create: [{ role: 'PLAYER' }] } },
      });
    }

    const login = async (email: string) =>
      (await request(ctx.app.getHttpServer()).post('/auth/login').send({ email, password }).expect(200)).headers['set-cookie'] as unknown as string[];
    coachCookie = await login('gs-coach@playslot.test');
    p1Cookie = await login('gs-p1@playslot.test');
    p2Cookie = await login('gs-p2@playslot.test');
    p3Cookie = await login('gs-p3@playslot.test');
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const http = () => request(ctx.app.getHttpServer());

  it('coach opens a group session → reserves coach + court and invites only subscribed players', async () => {
    const avail = await http().get(`/coaches/${coachProfileId}/availability?clubId=${clubId}&date=${DAY}`).expect(200);
    const free = avail.body.slots.find((s: { state: string; compatibleCourtIds: number[] }) => s.state === 'FREE' && s.compatibleCourtIds.length > 0);
    slotStart = free.start;

    const res = await http()
      .post('/group-sessions')
      .set('Cookie', coachCookie)
      .send({ clubId, courtId: free.compatibleCourtIds[0], startsAt: free.start, durationMin: 60, capacity: 2, priceCents: 1500, title: 'Group clinic' })
      .expect(201);
    sessionId = res.body.id;
    expect(res.body.spotsLeft).toBe(2);
    expect(res.body.cancelled).toBe(false);

    // invites are best-effort/async — let them flush.
    await new Promise((r) => setTimeout(r, 100));
    const invited = ctx.mail.groupInvites.map((x) => x.to);
    expect(invited).toContain('gs-p1@playslot.test');
    expect(invited).toContain('gs-p3@playslot.test');
    expect(invited).not.toContain('gs-p2@playslot.test'); // not subscribed
    expect(invited).not.toContain('gs-coach@playslot.test'); // never the host

    // the coach's slot is now taken.
    const after = await http().get(`/coaches/${coachProfileId}/availability?clubId=${clubId}&date=${DAY}`).expect(200);
    expect(after.body.slots.find((s: { start: string }) => s.start === slotStart).state).not.toBe('FREE');
  });

  it('players register up to capacity, then it is full; non-coaches cannot create', async () => {
    await http().post(`/group-sessions/${sessionId}/register`).set('Cookie', p1Cookie).expect(200);
    await http().post(`/group-sessions/${sessionId}/register`).set('Cookie', p2Cookie).expect(200);
    const third = await http().post(`/group-sessions/${sessionId}/register`).set('Cookie', p3Cookie).expect(422);
    expect(third.body.error).toBe('policy_violation');

    const detail = await http().get(`/group-sessions/${sessionId}`).set('Cookie', p1Cookie).expect(200);
    expect(detail.body.registeredCount).toBe(2);
    expect(detail.body.spotsLeft).toBe(0);
    expect(detail.body.registered).toBe(true);

    // a player cannot host a session
    await http()
      .post('/group-sessions')
      .set('Cookie', p1Cookie)
      .send({ clubId, courtId, startsAt: slotStart, durationMin: 60, capacity: 2, priceCents: 0, title: 'Nope' })
      .expect(403);
  });

  it('coach cancels → frees the slot and emails registrants', async () => {
    await http().delete(`/group-sessions/${sessionId}`).set('Cookie', coachCookie).expect(200);

    const cancelled = ctx.mail.groupCancellations.map((x) => x.to);
    expect(cancelled).toContain('gs-p1@playslot.test');
    expect(cancelled).toContain('gs-p2@playslot.test');

    // slot is bookable again, and the session drops off the public list.
    const after = await http().get(`/coaches/${coachProfileId}/availability?clubId=${clubId}&date=${DAY}`).expect(200);
    expect(after.body.slots.find((s: { start: string }) => s.start === slotStart).state).toBe('FREE');
    const list = await http().get(`/group-sessions?clubId=${clubId}`).expect(200);
    expect(list.body.map((s: { id: number }) => s.id)).not.toContain(sessionId);
  });
});
