import { formatInZone, instantFromDayMinutes } from '@playslot/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/password';
import { createTestApp, resetDb, type TestApp } from './utils';

/**
 * Phase 7 payments gate (roadmap P7, spec §17): online booking → PENDING_PAYMENT
 * + checkout URL; webhook success → CONFIRMED (idempotent on replay);
 * failure/timeout releases inventory (no phantom); refund on cancel. Uses the
 * mock provider (no STRIPE key in tests). Requires Postgres.
 */
describe('Payments (e2e, mock provider)', () => {
  let ctx: TestApp;
  const tz = 'Europe/Sofia';
  const password = 'Password123!';
  let clubId: number;
  let courtId: number;
  let cookie: string[];
  const DAY = formatInZone(new Date(Date.now() + 2 * 86_400_000), tz, 'yyyy-MM-dd');
  const at = (min: number) => instantFromDayMinutes(DAY, min, tz).toISOString();

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDb(ctx.prisma);
    const { prisma } = ctx;
    const city = await prisma.city.create({ data: { name: 'Sofia' } });
    const club = await prisma.club.create({
      data: { slug: 'pay-club', name: 'Pay Club', address: 'x', cityId: city.id, status: 'ACTIVE', currency: 'EUR', timezone: tz, slotIntervalMin: 60 },
    });
    clubId = club.id;
    const court = await prisma.resource.create({
      data: { clubId, type: 'COURT', name: 'C1', sport: 'TENNIS', minReservationMin: 60, slotIntervalMin: 60, availabilityRules: { create: Array.from({ length: 7 }, (_, weekday) => ({ weekday, startMin: 420, endMin: 1320 })) } },
    });
    courtId = court.id;
    await prisma.priceRule.create({ data: { clubId, priceCents: 4000, currency: 'EUR', durationMin: 60, priority: 0 } });
    await prisma.cancellationPolicy.create({
      data: { clubId, appliesTo: 'COURT', tiers: [{ minHoursBefore: 24, refundPercent: 100 }, { minHoursBefore: 0, refundPercent: 0 }] },
    });
    await prisma.user.create({
      data: { email: 'pay@playslot.test', name: 'Pay', passwordHash: await hashPassword(password), emailVerifiedAt: new Date(), roles: { create: [{ role: 'PLAYER' }] } },
    });
    cookie = (await request(ctx.app.getHttpServer()).post('/auth/login').send({ email: 'pay@playslot.test', password }).expect(200)).headers['set-cookie'] as unknown as string[];
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const http = () => request(ctx.app.getHttpServer());
  const bookOnline = (min: number) =>
    http().post('/reservations').set('Cookie', cookie).send({
      clubId, type: 'COURT', startsAt: at(min), durationMin: 60, paymentMethod: 'ONLINE', resourceIds: [courtId],
    });
  const webhook = (body: object) =>
    http().post('/payments/webhooks/stripe').set('Content-Type', 'application/json').send(body);

  it('online booking → PENDING_PAYMENT with a checkout URL and a pending payment', async () => {
    const res = await bookOnline(600).expect(201);
    expect(res.body.status).toBe('PENDING_PAYMENT');
    expect(res.body.next.action).toBe('PAY');
    expect(res.body.next.checkoutUrl).toContain('/pay/');
    const pay = await ctx.prisma.payment.findUnique({ where: { reservationId: res.body.reservationId } });
    expect(pay?.status).toBe('PENDING');
  });

  it('webhook success confirms, is idempotent, and sends confirmation', async () => {
    const created = (await bookOnline(660).expect(201)).body;
    const before = ctx.mail.confirmations.length;

    await webhook({ kind: 'paid', reservationId: created.reservationId, paymentRef: 'pi_test_1' }).expect(200);
    let r = await ctx.prisma.reservation.findUniqueOrThrow({ where: { id: created.reservationId } });
    expect(r.status).toBe('CONFIRMED');
    const pay = await ctx.prisma.payment.findUnique({ where: { reservationId: created.reservationId } });
    expect(pay?.status).toBe('CAPTURED');
    expect(pay?.providerRef).toBe('pi_test_1');
    expect(ctx.mail.confirmations.length).toBe(before + 1);

    // Replay → still CONFIRMED, no duplicate confirmation email.
    await webhook({ kind: 'paid', reservationId: created.reservationId, paymentRef: 'pi_test_1' }).expect(200);
    r = await ctx.prisma.reservation.findUniqueOrThrow({ where: { id: created.reservationId } });
    expect(r.status).toBe('CONFIRMED');
    expect(ctx.mail.confirmations.length).toBe(before + 1);
  });

  it('failed/expired payment releases inventory (no phantom)', async () => {
    const created = (await bookOnline(720).expect(201)).body;
    await webhook({ kind: 'failed', reservationId: created.reservationId }).expect(200);
    const r = await ctx.prisma.reservation.findUniqueOrThrow({ where: { id: created.reservationId } });
    expect(r.status).toBe('CANCELLED');
    // Slot rebookable.
    await bookOnline(720).expect(201);
  });

  it('refunds a captured payment on cancellation (≥24h → 100%)', async () => {
    const created = (await bookOnline(780).expect(201)).body; // 13:00, >24h out
    await webhook({ kind: 'paid', reservationId: created.reservationId, paymentRef: 'pi_test_2' }).expect(200);

    const res = await http().post(`/reservations/${created.reservationId}/cancel`).set('Cookie', cookie).send({}).expect(200);
    expect(res.body.refundCents).toBe(4000);
    expect(res.body.refundStatus).toBe('PENDING');
    const pay = await ctx.prisma.payment.findUnique({ where: { reservationId: created.reservationId } });
    expect(pay?.status).toBe('REFUNDED');
  });
});
