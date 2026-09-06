import { formatInZone, instantFromDayMinutes } from '@playslot/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/password';
import { createTestApp, resetDb, type TestApp } from './utils';

/**
 * Phase 5 coaching gate (roadmap P5, spec §7/§10): one transaction reserves the
 * coach + a compatible court; a coach linked to two clubs cannot be
 * double-booked across them (the §8 EXCLUDE constraint proves it, because the
 * coach is a single shared resource). Requires Postgres.
 */
describe('Coaching (e2e)', () => {
  let ctx: TestApp;
  const tz = 'Europe/Sofia';
  const password = 'Password123!';
  let clubAId: number;
  let clubBId: number;
  let courtAId: number;
  let courtBId: number;
  let coachProfileId: number;
  let serviceId: number;
  let cookie: string[];

  const at = (isoDate: string, min: number) => instantFromDayMinutes(isoDate, min, tz).toISOString();
  const DAY = formatInZone(new Date(Date.now() + 2 * 86_400_000), tz, 'yyyy-MM-dd');

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDb(ctx.prisma);
    const { prisma } = ctx;
    const city = await prisma.city.create({ data: { name: 'Sofia' } });
    const hash = await hashPassword(password);
    const hours = { create: Array.from({ length: 7 }, (_, weekday) => ({ weekday, startMin: 420, endMin: 1320 })) };

    const mkClub = async (slug: string) => {
      const club = await prisma.club.create({
        data: { slug, name: slug, address: 'x', cityId: city.id, status: 'ACTIVE', currency: 'EUR', timezone: tz, slotIntervalMin: 60 },
      });
      const court = await prisma.resource.create({
        data: { clubId: club.id, type: 'COURT', name: `${slug}-court`, sport: 'TENNIS', minReservationMin: 60, slotIntervalMin: 60, availabilityRules: hours },
      });
      await prisma.priceRule.create({ data: { clubId: club.id, priceCents: 3000, currency: 'EUR', durationMin: 60, priority: 0 } });
      return { clubId: club.id, courtId: court.id };
    };
    const a = await mkClub('club-a');
    const b = await mkClub('club-b');
    clubAId = a.clubId;
    clubBId = b.clubId;
    courtAId = a.courtId;
    courtBId = b.courtId;

    // A single coach resource (clubId null) linked to BOTH clubs.
    const coachUser = await prisma.user.create({
      data: { email: 'coach@playslot.test', name: 'Maria Coach', roles: { create: [{ role: 'COACH' }] } },
    });
    const profile = await prisma.coachProfile.create({
      data: { userId: coachUser.id, languages: ['bg', 'en'], levels: ['beginner'] },
    });
    coachProfileId = profile.id;
    const service = await prisma.coachService.create({
      data: { coachProfileId: profile.id, name: 'Private lesson', durationMin: 60, priceCents: 5000 },
    });
    serviceId = service.id;
    await prisma.resource.create({
      data: {
        clubId: null,
        type: 'COACH',
        name: 'Maria Coach',
        coachProfileId: profile.id,
        minReservationMin: 60,
        slotIntervalMin: 60,
        availabilityRules: { create: Array.from({ length: 7 }, (_, weekday) => ({ weekday, startMin: 540, endMin: 1260 })) },
      },
    });
    await prisma.coachClub.createMany({
      data: [
        { coachProfileId: profile.id, clubId: clubAId },
        { coachProfileId: profile.id, clubId: clubBId },
      ],
    });

    await prisma.user.create({
      data: { email: 'lesson-player@playslot.test', name: 'Player', passwordHash: hash, emailVerifiedAt: new Date(), roles: { create: [{ role: 'PLAYER' }] } },
    });
    cookie = (
      await request(ctx.app.getHttpServer()).post('/auth/login').send({ email: 'lesson-player@playslot.test', password }).expect(200)
    ).headers['set-cookie'] as unknown as string[];
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const http = () => request(ctx.app.getHttpServer());

  it('lists the coach in the directory with both clubs and services', async () => {
    const res = await http().get('/coaches').expect(200);
    const coach = res.body.find((c: { coachProfileId: number }) => c.coachProfileId === coachProfileId);
    expect(coach).toBeTruthy();
    expect(coach.clubs.map((c: { id: number }) => c.id).sort()).toEqual([clubAId, clubBId].sort());
    expect(coach.services[0].priceCents).toBe(5000);
  });

  it('offers the coach on court-first availability (coachIds on free slots)', async () => {
    const res = await http().get(`/availability?clubId=${clubAId}&date=${DAY}`).expect(200);
    const slot = res.body.slots.find((s: { start: string }) => s.start.includes('T10:00'));
    expect(slot.coachIds).toContain(coachProfileId);
  });

  it('books court + coach in ONE transaction (priced from the service)', async () => {
    const res = await http()
      .post('/reservations')
      .set('Cookie', cookie)
      .send({
        clubId: clubAId,
        type: 'LESSON',
        startsAt: at(DAY, 600),
        durationMin: 60,
        paymentMethod: 'ON_SITE',
        resourceIds: [courtAId],
        coachProfileId,
        serviceId,
      })
      .expect(201);
    expect(res.body.status).toBe('CONFIRMED');
    expect(res.body.priceCents).toBe(5000);

    const rr = await ctx.prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*)::int AS n FROM "ReservationResource" rr
      JOIN "Reservation" r ON r.id = rr."reservationId"
      WHERE rr."isActive" AND r."userId" = (SELECT id FROM "User" WHERE email='lesson-player@playslot.test')`;
    expect(Number(rr[0]!.n)).toBe(2); // court + coach
  });

  it('THE GATE: the coach cannot be double-booked across clubs (§8 constraint)', async () => {
    const res = await http()
      .post('/reservations')
      .set('Cookie', cookie)
      .send({
        clubId: clubBId,
        type: 'LESSON',
        startsAt: at(DAY, 600), // same time, different club
        durationMin: 60,
        paymentMethod: 'ON_SITE',
        resourceIds: [courtBId],
        coachProfileId,
        serviceId,
      })
      .expect(409);
    expect(res.body.error).toBe('availability_changed');
  });

  it('exposes coach-first availability with compatible courts, marking the taken slot busy', async () => {
    const res = await http()
      .get(`/coaches/${coachProfileId}/availability?clubId=${clubAId}&date=${DAY}&serviceId=${serviceId}`)
      .expect(200);
    const ten = res.body.slots.find((s: { start: string }) => s.start.includes('T10:00'));
    expect(ten.state).not.toBe('FREE'); // booked at 10:00
    const eleven = res.body.slots.find((s: { start: string }) => s.start.includes('T11:00'));
    expect(eleven.state).toBe('FREE');
    expect(eleven.compatibleCourtIds).toContain(courtAId);
  });
});
