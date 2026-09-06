import { formatInZone, instantFromDayMinutes } from '@playslot/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/password';
import { ReservationsService } from '../src/reservations/reservations.service';
import { createTestApp, resetDb, type TestApp } from './utils';

/**
 * Phase 3 booking-core gate (roadmap P3, spec §8): two simultaneous requests for
 * the same court+time → exactly one CONFIRMED and one 409; expired holds release
 * inventory; abandoned payments leave no phantom reservation.
 */
describe('Booking core & concurrency (e2e)', () => {
  let ctx: TestApp;
  const tz = 'Europe/Sofia';
  const password = 'Password123!';
  let clubId: number;
  let courtId: number;
  let verifiedCookie: string[];
  let unverifiedCookie: string[];

  const at = (isoDate: string, min: number) => instantFromDayMinutes(isoDate, min, tz).toISOString();
  // Near-future dates within the 14-day max-advance window (spec §12), so bookings
  // are valid and deterministic. Distinct days keep the tests independent.
  const day = (daysAhead: number) => formatInZone(new Date(Date.now() + daysAhead * 86_400_000), tz, 'yyyy-MM-dd');
  const DAY_A = day(2); // happy path + double-book share this slot
  const DAY_B = day(3); // concurrency
  const DAY_C = day(4); // online + expiry
  const DAY_D = day(5); // verified-email gate
  const DAY_E = day(6); // misaligned
  const DAY_F = day(7); // auth

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDb(ctx.prisma);
    const { prisma } = ctx;
    const city = await prisma.city.create({ data: { name: 'Sofia' } });
    const hash = await hashPassword(password);

    const club = await prisma.club.create({
      data: {
        slug: 'book-club',
        name: 'Book Club',
        address: 'x',
        cityId: city.id,
        status: 'ACTIVE',
        currency: 'EUR',
        timezone: tz,
        slotIntervalMin: 60,
      },
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
        availabilityRules: {
          create: Array.from({ length: 7 }, (_, weekday) => ({ weekday, startMin: 420, endMin: 1320 })),
        },
      },
    });
    courtId = court.id;
    await prisma.priceRule.create({
      data: { clubId, priceCents: 3000, currency: 'EUR', durationMin: 60, priority: 0 },
    });

    await prisma.user.create({
      data: {
        email: 'v@playslot.test',
        name: 'Verified',
        passwordHash: hash,
        emailVerifiedAt: new Date(),
        roles: { create: [{ role: 'PLAYER' }] },
      },
    });
    await prisma.user.create({
      data: {
        email: 'u@playslot.test',
        name: 'Unverified',
        passwordHash: hash,
        emailVerifiedAt: null,
        roles: { create: [{ role: 'PLAYER' }] },
      },
    });
    const login = async (email: string) =>
      (await request(ctx.app.getHttpServer()).post('/auth/login').send({ email, password }).expect(200))
        .headers['set-cookie'] as unknown as string[];
    verifiedCookie = await login('v@playslot.test');
    unverifiedCookie = await login('u@playslot.test');
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const http = () => request(ctx.app.getHttpServer());
  const bookingBody = (isoDate: string, min: number, method = 'ON_SITE') => ({
    clubId,
    type: 'COURT',
    startsAt: at(isoDate, min),
    durationMin: 60,
    paymentMethod: method,
    resourceIds: [courtId],
  });

  it('books a court end-to-end (on-site → CONFIRMED, server-priced)', async () => {
    const res = await http()
      .post('/reservations')
      .set('Cookie', verifiedCookie)
      .send(bookingBody(DAY_A, 600)) // 10:00 off-peak
      .expect(201);
    expect(res.body.status).toBe('CONFIRMED');
    expect(res.body.next.action).toBe('CONFIRMED');
    expect(res.body.priceCents).toBe(3000);
    expect(res.body.holdExpiresAt).toBeNull();
  });

  it('rejects a second booking of the same slot (409)', async () => {
    const res = await http()
      .post('/reservations')
      .set('Cookie', verifiedCookie)
      .send(bookingBody(DAY_A, 600))
      .expect(409);
    expect(res.body.error).toBe('availability_changed');
  });

  it('THE GATE: two concurrent bookings → exactly one CONFIRMED, one 409', async () => {
    const body = bookingBody(DAY_B, 660); // 11:00, fresh slot
    const p1 = http().post('/reservations').set('Cookie', verifiedCookie).send(body);
    const p2 = http().post('/reservations').set('Cookie', verifiedCookie).send(body);
    const [r1, r2] = await Promise.all([p1, p2]);

    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([201, 409]);

    // Exactly one ACTIVE ReservationResource for that resource+period.
    const rows = await ctx.prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*)::int AS n FROM "ReservationResource"
      WHERE "isActive" AND "resourceId" = ${courtId}
        AND period && tstzrange(${new Date(at(DAY_B, 660))}, ${new Date(at(DAY_B, 720))}, '[)')`;
    expect(Number(rows[0]!.n)).toBe(1);
  });

  it('online booking creates PENDING_PAYMENT with a hold, and expiry releases it', async () => {
    const create = await http()
      .post('/reservations')
      .set('Cookie', verifiedCookie)
      .send(bookingBody(DAY_C, 600, 'ONLINE'))
      .expect(201);
    expect(create.body.status).toBe('PENDING_PAYMENT');
    expect(create.body.next.action).toBe('PAY');
    expect(create.body.holdExpiresAt).not.toBeNull();

    const id = create.body.reservationId as number;
    // Simulate the hold elapsing, then run the expiry worker's logic directly.
    await ctx.prisma.reservation.update({
      where: { id },
      data: { holdExpiresAt: new Date(Date.now() - 1000) },
    });
    await ctx.app.get(ReservationsService).expireHold(id);

    const after = await ctx.prisma.reservation.findUniqueOrThrow({ where: { id } });
    expect(after.status).toBe('CANCELLED');

    // No phantom: the freed slot can be booked again.
    await http()
      .post('/reservations')
      .set('Cookie', verifiedCookie)
      .send(bookingBody(DAY_C, 600))
      .expect(201);
  });

  it('requires a verified email before booking (§12)', async () => {
    const res = await http()
      .post('/reservations')
      .set('Cookie', unverifiedCookie)
      .send(bookingBody(DAY_D, 600))
      .expect(422);
    expect(res.body.error).toBe('policy_violation');
  });

  it('rejects a past booking and a misaligned slot', async () => {
    await http()
      .post('/reservations')
      .set('Cookie', verifiedCookie)
      .send(bookingBody('2020-01-01', 600))
      .expect(422);

    // 10:30 start on a 60-min-grid club → misaligned
    await http()
      .post('/reservations')
      .set('Cookie', verifiedCookie)
      .send(bookingBody(DAY_E, 630))
      .expect(422);
  });

  it('requires authentication', async () => {
    await http().post('/reservations').send(bookingBody(DAY_F, 600)).expect(401);
  });
});
