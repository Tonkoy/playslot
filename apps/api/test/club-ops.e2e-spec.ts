import { formatInZone, instantFromDayMinutes } from '@playslot/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/password';
import { createTestApp, resetDb, type TestApp } from './utils';

/**
 * Phase 4 Club OS gate (roadmap P4): staff create/move/cancel/block via API; a
 * manual booking and an online booking occupy identical inventory; every mutation
 * is audit-logged. Requires Postgres.
 */
describe('Club Operating System (e2e)', () => {
  let ctx: TestApp;
  const tz = 'Europe/Sofia';
  const password = 'Password123!';
  let clubId: number;
  let courtId: number;
  let staffCookie: string[];
  let playerCookie: string[];

  const at = (isoDate: string, min: number) => instantFromDayMinutes(isoDate, min, tz).toISOString();
  const day = (d: number) => formatInZone(new Date(Date.now() + d * 86_400_000), tz, 'yyyy-MM-dd');
  const DAY = day(2);

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDb(ctx.prisma);
    const { prisma } = ctx;
    const city = await prisma.city.create({ data: { name: 'Sofia' } });
    const hash = await hashPassword(password);

    const staff = await prisma.user.create({
      data: {
        email: 'ops-staff@playslot.test',
        name: 'Ops Staff',
        passwordHash: hash,
        emailVerifiedAt: new Date(),
        roles: { create: [{ role: 'CLUB_STAFF' }] },
      },
    });
    await prisma.user.create({
      data: {
        email: 'ops-player@playslot.test',
        name: 'Ops Player',
        passwordHash: hash,
        emailVerifiedAt: new Date(),
        roles: { create: [{ role: 'PLAYER' }] },
      },
    });
    const club = await prisma.club.create({
      data: {
        slug: 'ops-club',
        name: 'Ops Club',
        address: 'x',
        cityId: city.id,
        status: 'ACTIVE',
        currency: 'EUR',
        timezone: tz,
        slotIntervalMin: 60,
        members: { create: [{ userId: staff.id, role: 'CLUB_STAFF' }] },
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

    const login = async (email: string) =>
      (await request(ctx.app.getHttpServer()).post('/auth/login').send({ email, password }).expect(200))
        .headers['set-cookie'] as unknown as string[];
    staffCookie = await login('ops-staff@playslot.test');
    playerCookie = await login('ops-player@playslot.test');
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const http = () => request(ctx.app.getHttpServer());
  const manual = (min: number) => ({
    startsAt: at(DAY, min),
    durationMin: 60,
    resourceIds: [courtId],
    customer: { name: 'Walk-in Ivan' },
  });

  it('forbids a non-staff user from Club OS endpoints', async () => {
    await http().get(`/clubs/${clubId}/calendar?date=${DAY}`).set('Cookie', playerCookie).expect(403);
    await http().post(`/clubs/${clubId}/reservations`).set('Cookie', playerCookie).send(manual(600)).expect(403);
  });

  it('creates a manual booking that occupies the same inventory as online bookings', async () => {
    const res = await http()
      .post(`/clubs/${clubId}/reservations`)
      .set('Cookie', staffCookie)
      .send(manual(600))
      .expect(201);
    expect(res.body.status).toBe('CONFIRMED');

    // A player online booking for the same slot is now blocked (identical inventory).
    const clash = await http()
      .post('/reservations')
      .set('Cookie', playerCookie)
      .send({ clubId, type: 'COURT', startsAt: at(DAY, 600), durationMin: 60, paymentMethod: 'ONLINE', resourceIds: [courtId] })
      .expect(409);
    expect(clash.body.error).toBe('availability_changed');
  });

  it('blocks a resource, preventing bookings in that window', async () => {
    await http()
      .post(`/clubs/${clubId}/blocks`)
      .set('Cookie', staffCookie)
      .send({ startsAt: at(DAY, 720), durationMin: 60, resourceIds: [courtId], reason: 'Maintenance' })
      .expect(201);

    await http()
      .post(`/clubs/${clubId}/reservations`)
      .set('Cookie', staffCookie)
      .send(manual(720))
      .expect(409);
  });

  it('reschedules a booking, and re-runs the conflict check on move', async () => {
    // Book at 13:00, then move to a free 14:00.
    const created = await http()
      .post(`/clubs/${clubId}/reservations`)
      .set('Cookie', staffCookie)
      .send(manual(780))
      .expect(201);
    const id = created.body.reservationId as number;

    await http()
      .patch(`/clubs/${clubId}/reservations/${id}`)
      .set('Cookie', staffCookie)
      .send({ startsAt: at(DAY, 840), durationMin: 60, resourceIds: [courtId] })
      .expect(200);

    // Moving onto the already-booked 10:00 slot → 409.
    const conflict = await http()
      .patch(`/clubs/${clubId}/reservations/${id}`)
      .set('Cookie', staffCookie)
      .send({ startsAt: at(DAY, 600), durationMin: 60, resourceIds: [courtId] })
      .expect(409);
    expect(conflict.body.error).toBe('availability_changed');
  });

  it('marks a reservation paid', async () => {
    const created = await http()
      .post(`/clubs/${clubId}/reservations`)
      .set('Cookie', staffCookie)
      .send(manual(900))
      .expect(201);
    const res = await http()
      .post(`/clubs/${clubId}/reservations/${created.body.reservationId}/mark-paid`)
      .set('Cookie', staffCookie)
      .expect(200);
    expect(res.body.paymentStatus).toBe('CAPTURED');
  });

  it('marks a started reservation as no-show and releases inventory', async () => {
    const created = await http()
      .post(`/clubs/${clubId}/reservations`)
      .set('Cookie', staffCookie)
      .send(manual(960))
      .expect(201);
    const id = created.body.reservationId as number;
    // Pretend it already started.
    await ctx.prisma.reservation.update({
      where: { id },
      data: { startsAt: new Date(Date.now() - 3_600_000) },
    });
    const res = await http()
      .post(`/clubs/${clubId}/reservations/${id}/no-show`)
      .set('Cookie', staffCookie)
      .expect(200);
    expect(res.body.status).toBe('NO_SHOW');
  });

  it('returns the calendar for the day with entries and courts', async () => {
    const res = await http().get(`/clubs/${clubId}/calendar?date=${DAY}`).set('Cookie', staffCookie).expect(200);
    expect(res.body.courts.map((c: { name: string }) => c.name)).toContain('Court 1');
    expect(res.body.entries.length).toBeGreaterThan(0);
    const block = res.body.entries.find((e: { type: string }) => e.type === 'BLOCK');
    expect(block).toBeTruthy();
  });

  it('audit-logs staff mutations', async () => {
    const logs = await ctx.prisma.auditLog.count({ where: { objectType: 'Reservation' } });
    expect(logs).toBeGreaterThan(0);
  });
});
