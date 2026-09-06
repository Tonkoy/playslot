import { formatInZone, instantFromDayMinutes } from '@playslot/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/password';
import { CoachScheduleService } from '../src/reservations/coach-schedule.service';
import { createTestApp, resetDb, type TestApp } from './utils';

/**
 * Notification expansion (spec §19): a confirmed booking notifies THREE parties
 * — the customer, the club admins/staff, and (for a lesson) the coach — and a
 * daily digest emails each coach their lessons for the day. Requires Postgres.
 */
describe('Notifications (e2e)', () => {
  let ctx: TestApp;
  const tz = 'Europe/Sofia';
  const password = 'Password123!';
  let clubId: number;
  let courtId: number;
  let coachProfileId: number;
  let serviceId: number;
  let cookie: string[];

  const at = (isoDate: string, min: number) => instantFromDayMinutes(isoDate, min, tz).toISOString();
  const day = (d: number) => formatInZone(new Date(Date.now() + d * 86_400_000), tz, 'yyyy-MM-dd');
  const DAY = day(2);

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDb(ctx.prisma);
    const { prisma } = ctx;
    const hash = await hashPassword(password);
    const city = await prisma.city.create({ data: { name: 'Sofia' } });
    const club = await prisma.club.create({
      data: { slug: 'notif-club', name: 'Notif Club', address: 'x', cityId: city.id, status: 'ACTIVE', currency: 'EUR', timezone: tz, slotIntervalMin: 60 },
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

    // Club admin + staff — both should be notified on every booking.
    const admin = await prisma.user.create({
      data: { email: 'admin@notif.test', name: 'Club Admin', passwordHash: hash, emailVerifiedAt: new Date(), roles: { create: [{ role: 'CLUB_ADMIN' }] } },
    });
    const staff = await prisma.user.create({
      data: { email: 'staff@notif.test', name: 'Front Desk', passwordHash: hash, emailVerifiedAt: new Date(), roles: { create: [{ role: 'CLUB_STAFF' }] } },
    });
    await prisma.clubMember.createMany({
      data: [
        { clubId, userId: admin.id, role: 'CLUB_ADMIN', status: 'ACTIVE' },
        { clubId, userId: staff.id, role: 'CLUB_STAFF', status: 'ACTIVE' },
      ],
    });

    // A coach linked to the club, with a private-lesson service.
    const coachUser = await prisma.user.create({
      data: { email: 'coach@notif.test', name: 'Maria Coach', roles: { create: [{ role: 'COACH' }] } },
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
        availabilityRules: { create: Array.from({ length: 7 }, (_, weekday) => ({ weekday, startMin: 420, endMin: 1320 })) },
      },
    });
    await prisma.coachClub.create({ data: { coachProfileId: profile.id, clubId } });

    await prisma.user.create({
      data: { email: 'player@notif.test', name: 'Player One', passwordHash: hash, emailVerifiedAt: new Date(), roles: { create: [{ role: 'PLAYER' }] } },
    });
    cookie = (
      await request(ctx.app.getHttpServer()).post('/auth/login').send({ email: 'player@notif.test', password }).expect(200)
    ).headers['set-cookie'] as unknown as string[];
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const http = () => request(ctx.app.getHttpServer());

  it('a court booking notifies the customer AND the club admin + staff (no coach)', async () => {
    const conf = ctx.mail.confirmations.length;
    const staffBefore = ctx.mail.staffNotices.length;
    const coachBefore = ctx.mail.coachNotices.length;

    await http()
      .post('/reservations')
      .set('Cookie', cookie)
      .send({ clubId, type: 'COURT', startsAt: at(DAY, 540), durationMin: 60, paymentMethod: 'ON_SITE', resourceIds: [courtId] })
      .expect(201);

    // customer
    expect(ctx.mail.confirmations.length).toBe(conf + 1);
    expect(ctx.mail.confirmations.at(-1)!.to).toBe('player@notif.test');
    // both staff members, addressed to their own emails
    const newStaff = ctx.mail.staffNotices.slice(staffBefore);
    expect(newStaff.map((s) => s.to).sort()).toEqual(['admin@notif.test', 'staff@notif.test']);
    expect(newStaff.every((s) => s.customerName === 'Player One')).toBe(true);
    // no coach on a plain court booking
    expect(ctx.mail.coachNotices.length).toBe(coachBefore);
  });

  it('a lesson booking additionally notifies the selected coach', async () => {
    const staffBefore = ctx.mail.staffNotices.length;
    const coachBefore = ctx.mail.coachNotices.length;

    await http()
      .post('/reservations')
      .set('Cookie', cookie)
      .send({ clubId, type: 'LESSON', startsAt: at(DAY, 600), durationMin: 60, paymentMethod: 'ON_SITE', resourceIds: [courtId], coachProfileId, serviceId })
      .expect(201);

    expect(ctx.mail.staffNotices.length).toBe(staffBefore + 2); // admin + staff
    expect(ctx.mail.coachNotices.length).toBe(coachBefore + 1);
    expect(ctx.mail.coachNotices.at(-1)!.to).toBe('coach@notif.test');
    expect(ctx.mail.coachNotices.at(-1)!.customerName).toBe('Player One');
  });

  it('daily coach schedule: emails the coach their lessons for the club-local day', async () => {
    const schedule = ctx.app.get(CoachScheduleService);
    // Book a lesson, then pin it to "today 10:00" club-local so we can drive the
    // digest deterministically from a fixed 07:00 reference instant.
    const created = (
      await http()
        .post('/reservations')
        .set('Cookie', cookie)
        .send({ clubId, type: 'LESSON', startsAt: at(DAY, 660), durationMin: 60, paymentMethod: 'ON_SITE', resourceIds: [courtId], coachProfileId, serviceId })
        .expect(201)
    ).body;
    const today = formatInZone(new Date(), tz, 'yyyy-MM-dd');
    await ctx.prisma.reservation.update({
      where: { id: created.reservationId },
      data: { startsAt: instantFromDayMinutes(today, 600, tz) }, // 10:00 local today
    });

    const sevenAm = instantFromDayMinutes(today, 7 * 60, tz);
    const before = ctx.mail.coachSchedules.length;
    const sent = await schedule.sendForTimezone(tz, [clubId], sevenAm);

    expect(sent).toBe(1);
    expect(ctx.mail.coachSchedules.length).toBe(before + 1);
    const digest = ctx.mail.coachSchedules.at(-1)!;
    expect(digest.to).toBe('coach@notif.test');
    expect(digest.coachName).toBe('Maria Coach');
    expect(digest.date).toBe(today);
    expect(digest.lessons.length).toBeGreaterThanOrEqual(1);
    expect(digest.lessons.some((l) => l.time === '10:00' && l.customerName === 'Player One')).toBe(true);
  });

  it('the hourly tick only fires clubs whose local time is the send hour', async () => {
    const schedule = ctx.app.get(CoachScheduleService);
    const today = formatInZone(new Date(), tz, 'yyyy-MM-dd');
    // 09:00 local is not the 07:00 send hour → nothing goes out.
    const before = ctx.mail.coachSchedules.length;
    const sent = await schedule.sendDailySchedules(instantFromDayMinutes(today, 9 * 60, tz));
    expect(sent).toBe(0);
    expect(ctx.mail.coachSchedules.length).toBe(before);
  });
});
