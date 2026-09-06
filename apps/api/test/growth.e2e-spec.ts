import { formatInZone, instantFromDayMinutes } from '@playslot/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/password';
import { createTestApp, resetDb, type TestApp } from './utils';

/**
 * Phase 9 marketplace growth: cross-club search, favorites, reviews. Requires Postgres.
 */
describe('Growth: search / favorites / reviews (e2e)', () => {
  let ctx: TestApp;
  const tz = 'Europe/Sofia';
  const password = 'Password123!';
  let clubAId: number;
  let clubBId: number;
  let courtAId: number;
  let cookie: string[];
  let playerId: number;

  const DAY = formatInZone(new Date(Date.now() + 2 * 86_400_000), tz, 'yyyy-MM-dd');

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDb(ctx.prisma);
    const { prisma } = ctx;
    const city = await prisma.city.create({ data: { name: 'Sofia' } });
    const hours = { create: Array.from({ length: 7 }, (_, weekday) => ({ weekday, startMin: 420, endMin: 1320 })) };

    const mk = async (slug: string, surface: 'CLAY' | 'HARD') => {
      const club = await prisma.club.create({
        data: { slug, name: slug, address: 'x', cityId: city.id, status: 'ACTIVE', currency: 'EUR', timezone: tz, slotIntervalMin: 60 },
      });
      const court = await prisma.resource.create({
        data: { clubId: club.id, type: 'COURT', name: `${slug}-c`, sport: 'TENNIS', surface, minReservationMin: 60, slotIntervalMin: 60, availabilityRules: hours },
      });
      await prisma.priceRule.create({ data: { clubId: club.id, priceCents: 3000, currency: 'EUR', durationMin: 60, priority: 0 } });
      return { clubId: club.id, courtId: court.id };
    };
    const a = await mk('search-a', 'CLAY');
    const b = await mk('search-b', 'HARD');
    clubAId = a.clubId;
    clubBId = b.clubId;
    courtAId = a.courtId;

    const player = await prisma.user.create({
      data: { email: 'growth@playslot.test', name: 'Growth', passwordHash: await hashPassword(password), emailVerifiedAt: new Date(), roles: { create: [{ role: 'PLAYER' }] } },
    });
    playerId = player.id;
    cookie = (await request(ctx.app.getHttpServer()).post('/auth/login').send({ email: 'growth@playslot.test', password }).expect(200)).headers['set-cookie'] as unknown as string[];
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const http = () => request(ctx.app.getHttpServer());

  it('cross-club search returns clubs with free counts and prices', async () => {
    const res = await http().get(`/search?date=${DAY}&sport=TENNIS&duration=60`).expect(200);
    expect(res.body.results.length).toBe(2);
    const r = res.body.results[0];
    expect(r.freeCount).toBeGreaterThan(0);
    expect(r.fromPriceCents).toBe(3000);
    expect(r.sampleTimes.length).toBeGreaterThan(0);
  });

  it('adds, lists, and removes a favorite', async () => {
    await http().post('/me/favorites').set('Cookie', cookie).send({ clubId: clubAId }).expect(200);
    // idempotent
    await http().post('/me/favorites').set('Cookie', cookie).send({ clubId: clubAId }).expect(200);
    let list = (await http().get('/me/favorites').set('Cookie', cookie).expect(200)).body;
    expect(list.map((c: { id: number }) => c.id)).toContain(clubAId);
    await http().delete(`/me/favorites/${clubAId}`).set('Cookie', cookie).expect(200);
    list = (await http().get('/me/favorites').set('Cookie', cookie).expect(200)).body;
    expect(list).toHaveLength(0);
  });

  it('requires a past booking to review, then accepts + aggregates', async () => {
    // No booking yet → 422
    await http().post(`/clubs/${clubAId}/reviews`).set('Cookie', cookie).send({ rating: 5 }).expect(422);

    // Create a past confirmed booking for this player at club A.
    const resv = await ctx.prisma.reservation.create({
      data: {
        clubId: clubAId,
        userId: playerId,
        type: 'COURT',
        status: 'CONFIRMED',
        source: 'WEB',
        startsAt: instantFromDayMinutes(formatInZone(new Date(Date.now() - 86_400_000), tz, 'yyyy-MM-dd'), 600, tz),
        endsAt: instantFromDayMinutes(formatInZone(new Date(Date.now() - 86_400_000), tz, 'yyyy-MM-dd'), 660, tz),
        priceCents: 3000,
        currency: 'EUR',
        paymentMethod: 'ON_SITE',
      },
    });
    void resv;

    await http().post(`/clubs/${clubAId}/reviews`).set('Cookie', cookie).send({ rating: 4, comment: 'Great clay courts' }).expect(200);
    // upsert: second review updates, doesn't duplicate
    await http().post(`/clubs/${clubAId}/reviews`).set('Cookie', cookie).send({ rating: 5 }).expect(200);

    const reviews = (await http().get(`/clubs/${clubAId}/reviews`).expect(200)).body;
    expect(reviews.count).toBe(1);
    expect(reviews.averageRating).toBe(5);
    expect(reviews.reviews[0].authorName).toBe('Growth');
  });

  it('validates the review rating range', async () => {
    await http().post(`/clubs/${clubBId}/reviews`).set('Cookie', cookie).send({ rating: 9 }).expect(400);
  });
});
