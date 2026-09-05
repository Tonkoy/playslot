import { instantFromDayMinutes } from '@playslot/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, resetDb, type TestApp } from './utils';

/**
 * Phase 2 availability gate (roadmap P2): the grid reflects rules/blocks exactly,
 * prices are computed server-side, occupancy marks slots RESERVED. Requires a
 * test Postgres (see setup-e2e.ts).
 */
describe('Availability (e2e)', () => {
  let ctx: TestApp;
  const tz = 'Europe/Sofia';
  const date = '2030-06-12'; // far future → nothing is PAST
  let clubId: number;
  let courtId: number;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDb(ctx.prisma);
    const { prisma } = ctx;

    const city = await prisma.city.create({ data: { name: 'Sofia' } });
    const club = await prisma.club.create({
      data: {
        slug: 'grid-club',
        name: 'Grid Club',
        address: 'x',
        cityId: city.id,
        status: 'ACTIVE',
        currency: 'EUR',
        timezone: tz,
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
        allowHalfHour: false,
        availabilityRules: {
          create: Array.from({ length: 7 }, (_, weekday) => ({
            weekday,
            startMin: 7 * 60,
            endMin: 22 * 60,
          })),
        },
      },
    });
    courtId = court.id;

    await prisma.priceRule.create({
      data: { clubId, priceCents: 3000, currency: 'EUR', durationMin: 60, priority: 0 },
    });
    await prisma.priceRule.create({
      data: {
        clubId,
        priceCents: 4200,
        currency: 'EUR',
        durationMin: 60,
        weekdayMask: 0b0111110, // Mon–Fri
        startMin: 17 * 60,
        endMin: 22 * 60,
        priority: 10,
      },
    });

    // occupancy: one CONFIRMED reservation 18:00–19:00 (raw tstzrange insert)
    const player = await prisma.user.create({
      data: { email: 'occ@playslot.test', name: 'Occ', roles: { create: [{ role: 'PLAYER' }] } },
    });
    const startsAt = instantFromDayMinutes(date, 18 * 60, tz);
    const endsAt = instantFromDayMinutes(date, 19 * 60, tz);
    const resv = await prisma.reservation.create({
      data: {
        clubId,
        userId: player.id,
        type: 'COURT',
        status: 'CONFIRMED',
        source: 'CLUB_STAFF',
        startsAt,
        endsAt,
        priceCents: 4200,
        currency: 'EUR',
        paymentMethod: 'ON_SITE',
      },
    });
    await prisma.$executeRaw`
      INSERT INTO "ReservationResource" ("reservationId", "resourceId", period, "isActive")
      VALUES (${resv.id}, ${courtId}, tstzrange(${startsAt}, ${endsAt}, '[)'), true)`;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const http = () => request(ctx.app.getHttpServer());

  it('returns the grid for the club/date with server-computed prices', async () => {
    const res = await http()
      .get(`/availability?clubId=${clubId}&date=${date}&duration=60`)
      .expect(200);

    expect(res.body.currency).toBe('EUR');
    expect(res.body.timezone).toBe(tz);
    expect(res.body.courts).toHaveLength(1);
    // 07:00 … 21:00 starts = 15 slots
    expect(res.body.slots).toHaveLength(15);

    // summer offset in June
    const nine = res.body.slots.find((s: { start: string }) => s.start.includes('T09:00'));
    expect(nine.start).toContain('+03:00');
    expect(nine.priceCents).toBe(3000); // off-peak morning
    expect(nine.state).toBe('FREE');
  });

  it('marks the reserved 18:00 slot as RESERVED and prices peak elsewhere', async () => {
    const res = await http().get(`/availability?clubId=${clubId}&date=${date}`).expect(200);
    const six = res.body.slots.find((s: { start: string }) => s.start.includes('T18:00'));
    expect(six.state).toBe('RESERVED');

    // 2030-06-12 is a Wednesday → evening is peak (4200)
    const seven = res.body.slots.find((s: { start: string }) => s.start.includes('T19:00'));
    expect(seven.priceCents).toBe(4200);
  });

  it('404s for an unknown or inactive club', async () => {
    const res = await http().get(`/availability?clubId=999999&date=${date}`).expect(404);
    expect(res.body.error).toBe('not_found');
  });

  it('validates the date format', async () => {
    const res = await http().get(`/availability?clubId=${clubId}&date=not-a-date`).expect(400);
    expect(res.body.error).toBe('validation_failed');
  });
});
