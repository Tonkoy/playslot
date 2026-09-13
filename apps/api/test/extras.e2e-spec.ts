import { formatInZone, instantFromDayMinutes } from '@playslot/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/password';
import { createTestApp, resetDb, type TestApp } from './utils';

/**
 * Phase 9 extras: membership pricing + event/tournament registration. Requires Postgres.
 */
describe('Extras: memberships + events (e2e)', () => {
  let ctx: TestApp;
  const tz = 'Europe/Sofia';
  const password = 'Password123!';
  let clubId: number;
  let courtId: number;
  let adminCookie: string[];
  let playerCookie: string[];
  let player2Cookie: string[];
  const DAY = formatInZone(new Date(Date.now() + 2 * 86_400_000), tz, 'yyyy-MM-dd');
  const at = (min: number) => instantFromDayMinutes(DAY, min, tz).toISOString();

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDb(ctx.prisma);
    const { prisma } = ctx;
    const city = await prisma.city.create({ data: { name: 'Sofia' } });
    const hash = await hashPassword(password);

    const admin = await prisma.user.create({
      data: { email: 'x-admin@playslot.test', name: 'Admin', passwordHash: hash, emailVerifiedAt: new Date(), roles: { create: [{ role: 'CLUB_ADMIN' }] } },
    });
    for (const email of ['x-p1@playslot.test', 'x-p2@playslot.test']) {
      await prisma.user.create({
        data: { email, name: email, passwordHash: hash, emailVerifiedAt: new Date(), roles: { create: [{ role: 'PLAYER' }] } },
      });
    }
    const club = await prisma.club.create({
      data: {
        slug: 'x-club', name: 'X Club', address: 'x', cityId: city.id, status: 'ACTIVE', currency: 'EUR', timezone: tz, slotIntervalMin: 60,
        members: { create: [{ userId: admin.id, role: 'CLUB_ADMIN' }] },
      },
    });
    clubId = club.id;
    const court = await prisma.resource.create({
      data: { clubId, type: 'COURT', name: 'C1', sport: 'TENNIS', minReservationMin: 60, slotIntervalMin: 60, availabilityRules: { create: Array.from({ length: 7 }, (_, weekday) => ({ weekday, startMin: 420, endMin: 1320 })) } },
    });
    courtId = court.id;
    await prisma.priceRule.create({ data: { clubId, priceCents: 3000, currency: 'EUR', durationMin: 60, priority: 0 } });

    const login = async (email: string) =>
      (await request(ctx.app.getHttpServer()).post('/auth/login').send({ email, password }).expect(200)).headers['set-cookie'] as unknown as string[];
    adminCookie = await login('x-admin@playslot.test');
    playerCookie = await login('x-p1@playslot.test');
    player2Cookie = await login('x-p2@playslot.test');
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const http = () => request(ctx.app.getHttpServer());

  describe('memberships (member pricing)', () => {
    it('applies a member discount to availability + booking price', async () => {
      // Base price for a member-less player.
      const base = await http().get(`/availability?clubId=${clubId}&date=${DAY}`).set('Cookie', playerCookie).expect(200);
      expect(base.body.slots.find((s: { start: string }) => s.start.includes('T10:00')).priceCents).toBe(3000);

      // Admin creates a 20%-off plan and grants it to the player.
      const plan = (
        await http().post(`/clubs/${clubId}/membership-plans`).set('Cookie', adminCookie)
          .send({ name: 'Gold', priceCents: 5000, durationDays: 30, discountPercent: 20 }).expect(201)
      ).body;
      await http().post(`/clubs/${clubId}/memberships`).set('Cookie', adminCookie)
        .send({ userEmail: 'x-p1@playslot.test', planId: plan.id }).expect(200);

      // Member now sees 20% off, and books at the discounted price.
      const withMember = await http().get(`/availability?clubId=${clubId}&date=${DAY}`).set('Cookie', playerCookie).expect(200);
      expect(withMember.body.slots.find((s: { start: string }) => s.start.includes('T10:00')).priceCents).toBe(2400);

      const booking = await http().post('/reservations').set('Cookie', playerCookie)
        .send({ clubId, type: 'COURT', startsAt: at(600), durationMin: 60, paymentMethod: 'ON_SITE', resourceIds: [courtId] }).expect(201);
      expect(booking.body.priceCents).toBe(2400);

      // A non-member still pays full price.
      const other = await http().get(`/availability?clubId=${clubId}&date=${DAY}`).set('Cookie', player2Cookie).expect(200);
      expect(other.body.slots.find((s: { start: string }) => s.start.includes('T11:00')).priceCents).toBe(3000);
    });

    it('lists the member’s memberships', async () => {
      const res = await http().get('/me/memberships').set('Cookie', playerCookie).expect(200);
      expect(res.body[0].planName).toBe('Gold');
      expect(res.body[0].active).toBe(true);
    });
  });

  describe('events / tournaments', () => {
    let eventId: number;

    it('admin creates an event; non-admin cannot', async () => {
      await http().post(`/clubs/${clubId}/events`).set('Cookie', playerCookie)
        .send({ type: 'TOURNAMENT', title: 'Club Open', startsAt: at(1080), endsAt: at(1200), capacity: 2 }).expect(403);

      const ev = await http().post(`/clubs/${clubId}/events`).set('Cookie', adminCookie)
        .send({ type: 'TOURNAMENT', title: 'Club Open', startsAt: at(1080), endsAt: at(1200), capacity: 2, feeCents: 1000 }).expect(201);
      eventId = ev.body.id;
    });

    it('lists publicly and registers up to capacity, then rejects', async () => {
      const list = await http().get(`/events?clubId=${clubId}`).expect(200);
      expect(list.body.map((e: { id: number }) => e.id)).toContain(eventId);

      await http().post(`/events/${eventId}/register`).set('Cookie', playerCookie).expect(200);
      await http().post(`/events/${eventId}/register`).set('Cookie', player2Cookie).expect(200);
      // capacity is 2 → a third registrant is rejected
      const admin3 = await http().post(`/events/${eventId}/register`).set('Cookie', adminCookie).expect(422);
      expect(admin3.body.error).toBe('policy_violation');

      const detail = await http().get(`/events/${eventId}`).set('Cookie', playerCookie).expect(200);
      expect(detail.body.registeredCount).toBe(2);
      expect(detail.body.spotsLeft).toBe(0);
      expect(detail.body.registered).toBe(true);
    });

    it('unregister frees a spot', async () => {
      await http().delete(`/events/${eventId}/register`).set('Cookie', playerCookie).expect(200);
      const detail = await http().get(`/events/${eventId}`).expect(200);
      expect(detail.body.spotsLeft).toBe(1);
      // admin can now grab the freed spot
      await http().post(`/events/${eventId}/register`).set('Cookie', adminCookie).expect(200);
    });
  });

  describe('special days (closures)', () => {
    const CLOSE_DAY = formatInZone(new Date(Date.now() + 5 * 86_400_000), tz, 'yyyy-MM-dd');
    const anyFree = (body: { slots: { state: string }[] }) => body.slots.some((s) => s.state === 'FREE');

    it('an all-day closure blocks availability and can be removed (admin only)', async () => {
      expect(anyFree((await http().get(`/availability?clubId=${clubId}&date=${CLOSE_DAY}`).expect(200)).body)).toBe(true);

      // a non-admin cannot create a closure
      await http().post(`/clubs/${clubId}/closures`).set('Cookie', playerCookie).send({ fromDate: CLOSE_DAY, toDate: CLOSE_DAY, reason: 'x' }).expect(403);

      const created = await http()
        .post(`/clubs/${clubId}/closures`)
        .set('Cookie', adminCookie)
        .send({ fromDate: CLOSE_DAY, toDate: CLOSE_DAY, allDay: true, reason: 'Holiday' })
        .expect(201);
      expect(created.body.courtCount).toBeGreaterThan(0);

      // the whole day is now blocked, and the closure is listed
      expect(anyFree((await http().get(`/availability?clubId=${clubId}&date=${CLOSE_DAY}`).expect(200)).body)).toBe(false);
      expect((await http().get(`/clubs/${clubId}/closures`).set('Cookie', adminCookie).expect(200)).body).toHaveLength(1);

      // removing it restores availability
      await http()
        .delete(`/clubs/${clubId}/closures`)
        .set('Cookie', adminCookie)
        .send({ startsAt: created.body.startsAt, endsAt: created.body.endsAt })
        .expect(200);
      expect(anyFree((await http().get(`/availability?clubId=${clubId}&date=${CLOSE_DAY}`).expect(200)).body)).toBe(true);
    });
  });
});
