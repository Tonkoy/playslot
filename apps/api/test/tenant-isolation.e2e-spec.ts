import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/password';
import { createTestApp, resetDb, type TestApp } from './utils';

/**
 * Phase 1 tenant-isolation gate (roadmap P1, golden rule §2.7): Club A can never
 * read or mutate Club B. Enforced by ClubMembershipGuard + club-scoped queries.
 */
describe('Tenant isolation (e2e)', () => {
  let ctx: TestApp;
  const password = 'Password123!';
  let clubAId: number;
  let clubBId: number;
  let courtBId: number;
  let cookieA: string[];

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDb(ctx.prisma);
    const { prisma } = ctx;

    const city = await prisma.city.create({ data: { name: 'Sofia' } });
    const passwordHash = await hashPassword(password);

    const adminA = await prisma.user.create({
      data: {
        email: 'admin-a@playslot.test',
        name: 'Admin A',
        passwordHash,
        emailVerifiedAt: new Date(),
        roles: { create: [{ role: 'CLUB_ADMIN' }] },
      },
    });
    const adminB = await prisma.user.create({
      data: {
        email: 'admin-b@playslot.test',
        name: 'Admin B',
        passwordHash,
        emailVerifiedAt: new Date(),
        roles: { create: [{ role: 'CLUB_ADMIN' }] },
      },
    });

    const clubA = await prisma.club.create({
      data: {
        slug: 'club-a',
        name: 'Club A',
        address: 'A',
        cityId: city.id,
        status: 'ACTIVE',
        members: { create: [{ userId: adminA.id, role: 'CLUB_ADMIN' }] },
      },
    });
    const clubB = await prisma.club.create({
      data: {
        slug: 'club-b',
        name: 'Club B',
        address: 'B',
        cityId: city.id,
        status: 'ACTIVE',
        members: { create: [{ userId: adminB.id, role: 'CLUB_ADMIN' }] },
      },
    });
    clubAId = clubA.id;
    clubBId = clubB.id;

    const courtB = await prisma.resource.create({
      data: { clubId: clubB.id, type: 'COURT', name: 'B-Court', sport: 'TENNIS' },
    });
    courtBId = courtB.id;

    const login = await request(ctx.app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin-a@playslot.test', password })
      .expect(200);
    cookieA = login.headers['set-cookie'] as unknown as string[];
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const http = () => request(ctx.app.getHttpServer());

  it('lets Admin A manage their own club', async () => {
    await http()
      .patch(`/clubs/${clubAId}`)
      .set('Cookie', cookieA)
      .send({
        name: 'Club A Renamed',
        slug: 'club-a',
        address: 'A street 1',
        cityId: (await ctx.prisma.club.findUniqueOrThrow({ where: { id: clubAId } })).cityId,
        timezone: 'Europe/Sofia',
        currency: 'EUR',
      })
      .expect(200);
  });

  it('creates a court in Admin A’s own club', async () => {
    await http()
      .post(`/clubs/${clubAId}/resources`)
      .set('Cookie', cookieA)
      .send({ name: 'A-Court', sport: 'TENNIS' })
      .expect(201);
  });

  it('forbids Admin A from editing Club B', async () => {
    const res = await http()
      .patch(`/clubs/${clubBId}`)
      .set('Cookie', cookieA)
      .send({
        name: 'Hijack',
        slug: 'club-b',
        address: 'x',
        cityId: 1,
        timezone: 'Europe/Sofia',
        currency: 'EUR',
      })
      .expect(403);
    expect(res.body.error).toBe('forbidden');
  });

  it('forbids Admin A from reading/creating resources in Club B', async () => {
    await http().get(`/clubs/${clubBId}/resources`).set('Cookie', cookieA).expect(403);
    await http()
      .post(`/clubs/${clubBId}/resources`)
      .set('Cookie', cookieA)
      .send({ name: 'X', sport: 'TENNIS' })
      .expect(403);
  });

  it('cannot reach Club B’s court through Club A’s scope (404, not cross-tenant)', async () => {
    const res = await http()
      .patch(`/clubs/${clubAId}/resources/${courtBId}`)
      .set('Cookie', cookieA)
      .send({ name: 'Stolen', sport: 'TENNIS' })
      .expect(404);
    expect(res.body.error).toBe('not_found');
  });

  it('exposes both active clubs publicly without auth', async () => {
    const res = await http().get('/clubs').expect(200);
    const slugs = res.body.map((c: { slug: string }) => c.slug);
    expect(slugs).toContain('club-a');
    expect(slugs).toContain('club-b');

    await http().get('/clubs/club-b').expect(200);
    await http().get('/clubs/club-b/courts').expect(200);
  });
});
