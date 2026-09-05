import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/password';
import { createTestApp, resetDb, type TestApp } from './utils';

/**
 * Club configuration (this slice): per-club slot time (30/60) and court
 * management (count + type), plus the /me/clubs admin listing. Requires Postgres.
 */
describe('Club configuration (e2e)', () => {
  let ctx: TestApp;
  const password = 'Password123!';
  let clubId: number;
  let adminCookie: string[];
  let playerCookie: string[];

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDb(ctx.prisma);
    const { prisma } = ctx;
    const city = await prisma.city.create({ data: { name: 'Sofia' } });
    const hash = await hashPassword(password);

    const admin = await prisma.user.create({
      data: {
        email: 'cfg-admin@playslot.test',
        name: 'Cfg Admin',
        passwordHash: hash,
        emailVerifiedAt: new Date(),
        roles: { create: [{ role: 'CLUB_ADMIN' }] },
      },
    });
    await prisma.user.create({
      data: {
        email: 'cfg-player@playslot.test',
        name: 'Cfg Player',
        passwordHash: hash,
        emailVerifiedAt: new Date(),
        roles: { create: [{ role: 'PLAYER' }] },
      },
    });
    const club = await prisma.club.create({
      data: {
        slug: 'cfg-club',
        name: 'Cfg Club',
        address: 'x',
        cityId: city.id,
        status: 'ACTIVE',
        slotIntervalMin: 60,
        members: { create: [{ userId: admin.id, role: 'CLUB_ADMIN' }] },
      },
    });
    clubId = club.id;
    await prisma.priceRule.create({
      data: { clubId, priceCents: 3000, currency: 'EUR', durationMin: 60, priority: 0 },
    });

    const login = async (email: string) =>
      (await request(ctx.app.getHttpServer()).post('/auth/login').send({ email, password }).expect(200))
        .headers['set-cookie'] as unknown as string[];
    adminCookie = await login('cfg-admin@playslot.test');
    playerCookie = await login('cfg-player@playslot.test');
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const http = () => request(ctx.app.getHttpServer());

  it('lists the admin’s clubs via /me/clubs', async () => {
    const res = await http().get('/me/clubs').set('Cookie', adminCookie).expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].club.id).toBe(clubId);
    expect(res.body[0].role).toBe('CLUB_ADMIN');
  });

  it('sets the club-wide slot time to 30', async () => {
    const res = await http()
      .patch(`/clubs/${clubId}/settings`)
      .set('Cookie', adminCookie)
      .send({ slotIntervalMin: 30 })
      .expect(200);
    expect(res.body.slotIntervalMin).toBe(30);
  });

  it('rejects an invalid slot time', async () => {
    const res = await http()
      .patch(`/clubs/${clubId}/settings`)
      .set('Cookie', adminCookie)
      .send({ slotIntervalMin: 45 })
      .expect(400);
    expect(res.body.error).toBe('validation_failed');
  });

  it('forbids a non-admin from changing settings', async () => {
    await http()
      .patch(`/clubs/${clubId}/settings`)
      .set('Cookie', playerCookie)
      .send({ slotIntervalMin: 60 })
      .expect(403);
  });

  it('adds a court (type + count) that appears on the grid with the club slot time', async () => {
    await http()
      .post(`/clubs/${clubId}/resources`)
      .set('Cookie', adminCookie)
      .send({ name: 'Clay 1', sport: 'TENNIS', surface: 'CLAY', isIndoor: false })
      .expect(201);

    const res = await http()
      .get(`/availability?clubId=${clubId}&date=2030-06-12`)
      .expect(200);
    expect(res.body.slotIntervalMin).toBe(30);
    expect(res.body.courts.map((c: { name: string }) => c.name)).toContain('Clay 1');
    // 30-min granularity → a :30 start exists
    const half = res.body.slots.find((s: { start: string }) => s.start.includes('T07:30'));
    expect(half).toBeTruthy();
  });
});
