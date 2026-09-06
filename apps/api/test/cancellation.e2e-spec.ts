import { formatInZone, instantFromDayMinutes } from '@playslot/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/password';
import { createTestApp, resetDb, type TestApp } from './utils';

/**
 * Phase 6 gate (roadmap P6, spec §12/§18): a player cancels within policy → the
 * correct refund is computed → the freed slot reopens; confirmation +
 * cancellation emails are sent. Requires Postgres.
 */
describe('Cancellation & refunds (e2e)', () => {
  let ctx: TestApp;
  const tz = 'Europe/Sofia';
  const password = 'Password123!';
  let clubId: number;
  let courtId: number;
  let cookie: string[];

  const at = (isoDate: string, min: number) => instantFromDayMinutes(isoDate, min, tz).toISOString();
  const day = (d: number) => formatInZone(new Date(Date.now() + d * 86_400_000), tz, 'yyyy-MM-dd');
  const DAY = day(2);

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDb(ctx.prisma);
    const { prisma } = ctx;
    const city = await prisma.city.create({ data: { name: 'Sofia' } });
    const club = await prisma.club.create({
      data: { slug: 'cx-club', name: 'CX Club', address: 'x', cityId: city.id, status: 'ACTIVE', currency: 'EUR', timezone: tz, slotIntervalMin: 60 },
    });
    clubId = club.id;
    const court = await prisma.resource.create({
      data: {
        clubId,
        type: 'COURT',
        name: 'Court 1',
        sport: 'TENNIS',
        minReservationMin: 60,
        slotIntervalMin: 60,
        availabilityRules: { create: Array.from({ length: 7 }, (_, weekday) => ({ weekday, startMin: 420, endMin: 1320 })) },
      },
    });
    courtId = court.id;
    await prisma.priceRule.create({ data: { clubId, priceCents: 3000, currency: 'EUR', durationMin: 60, priority: 0 } });
    await prisma.cancellationPolicy.create({
      data: {
        clubId,
        appliesTo: 'COURT',
        tiers: [
          { minHoursBefore: 24, refundPercent: 100 },
          { minHoursBefore: 12, refundPercent: 50 },
          { minHoursBefore: 0, refundPercent: 0 },
        ],
      },
    });
    await prisma.user.create({
      data: { email: 'cx@playslot.test', name: 'CX', passwordHash: await hashPassword(password), emailVerifiedAt: new Date(), roles: { create: [{ role: 'PLAYER' }] } },
    });
    cookie = (await request(ctx.app.getHttpServer()).post('/auth/login').send({ email: 'cx@playslot.test', password }).expect(200)).headers['set-cookie'] as unknown as string[];
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const http = () => request(ctx.app.getHttpServer());
  const book = (min: number) =>
    http()
      .post('/reservations')
      .set('Cookie', cookie)
      .send({ clubId, type: 'COURT', startsAt: at(DAY, min), durationMin: 60, paymentMethod: 'ON_SITE', resourceIds: [courtId] });

  // Override startsAt to control the hours-before-start for the refund tier.
  const setStart = (id: number, hoursFromNow: number) =>
    ctx.prisma.reservation.update({ where: { id }, data: { startsAt: new Date(Date.now() + hoursFromNow * 3_600_000) } });

  it('sends a confirmation email on booking', async () => {
    const before = ctx.mail.confirmations.length;
    await book(600).expect(201);
    expect(ctx.mail.confirmations.length).toBe(before + 1);
    expect(ctx.mail.confirmations.at(-1)!.to).toBe('cx@playslot.test');
  });

  it('refunds 100% when cancelled ≥24h before, and reopens the slot', async () => {
    const created = (await book(660).expect(201)).body; // 11:00
    await setStart(created.reservationId, 30);
    const res = await http().post(`/reservations/${created.reservationId}/cancel`).set('Cookie', cookie).send({}).expect(200);
    expect(res.body.refundCents).toBe(3000);
    expect(ctx.mail.cancellations.at(-1)!.refundCents).toBe(3000);
    // Slot reopens: the original 11:00 slot can be booked again.
    await book(660).expect(201);
  });

  it('refunds 50% in the 12–24h window', async () => {
    const created = (await book(720).expect(201)).body; // 12:00
    await setStart(created.reservationId, 18);
    const res = await http().post(`/reservations/${created.reservationId}/cancel`).set('Cookie', cookie).send({}).expect(200);
    expect(res.body.refundCents).toBe(1500);
  });

  it('refunds 0% under 12h', async () => {
    const created = (await book(780).expect(201)).body; // 13:00
    await setStart(created.reservationId, 3);
    const res = await http().post(`/reservations/${created.reservationId}/cancel`).set('Cookie', cookie).send({}).expect(200);
    expect(res.body.refundCents).toBe(0);
  });

  it('forbids cancelling someone else’s reservation', async () => {
    const created = (await book(840).expect(201)).body; // 14:00
    const other = await ctx.prisma.user.create({
      data: { email: 'cx2@playslot.test', name: 'CX2', passwordHash: await hashPassword(password), emailVerifiedAt: new Date(), roles: { create: [{ role: 'PLAYER' }] } },
    });
    void other;
    const otherCookie = (await http().post('/auth/login').send({ email: 'cx2@playslot.test', password }).expect(200)).headers['set-cookie'] as unknown as string[];
    await http().post(`/reservations/${created.reservationId}/cancel`).set('Cookie', otherCookie).send({}).expect(403);
  });
});
