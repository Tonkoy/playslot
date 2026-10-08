import { Injectable } from '@nestjs/common';
import type { AdminStatsDto, CoachStatDto, DailyStatDto, StatsQuery } from '@playslot/contracts';
import { formatInZone, zonedTimeToUtc } from '@playslot/domain';
import { AppException } from '../common/app-exception';
import { PrismaService } from '../prisma/prisma.service';

const TZ = 'Europe/Sofia';
/** Money counts once the slot is committed; a no-show still owes the court. */
const EARNED = new Set(['CONFIRMED', 'COMPLETED', 'NO_SHOW']);
const PENDING = new Set(['PENDING_PAYMENT']);
const MAX_RANGE_DAYS = 366;
const TOP_N = 5;

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dayStart = (iso: string) => zonedTimeToUtc(`${iso}T00:00`, TZ);
const localDay = (d: Date) => formatInZone(d, TZ, 'yyyy-MM-dd');

/**
 * Admin summary. One pass over the rows in the widest window needed (the
 * period, this month and this week), aggregated in memory — cheap at today's
 * volume; move to SQL rollups once a month holds tens of thousands of bookings.
 *
 * Dates are the day the session is played (Sofia time), not the day it was
 * booked: "money for the day" = what the courts and coaches earned that day.
 */
@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(query: StatsQuery, scope: 'platform' | 'club'): Promise<AdminStatsDto> {
    const clubId = query.clubId;
    const today = localDay(new Date());
    const weekday = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = Sun
    const weekStart = addDays(today, -((weekday + 6) % 7)); // Monday
    const monthStart = `${today.slice(0, 8)}01`;
    const from = query.from ?? monthStart;
    const to = query.to ?? today;
    if (from > to) throw new AppException('validation_failed', { fields: { from: ['after_to'] } });
    const span = (dayStart(addDays(to, 1)).getTime() - dayStart(from).getTime()) / 86_400_000;
    if (span > MAX_RANGE_DAYS) throw new AppException('validation_failed', { fields: { to: ['range_too_long'] } });

    // Widest window any tile needs.
    const lo = [from, weekStart, monthStart].sort()[0]!;
    const hiDay = [to, today].sort().reverse()[0]!;
    const winStart = dayStart(lo);
    const winEnd = dayStart(addDays(hiDay, 1));
    const pStart = dayStart(from);
    const pEnd = dayStart(addDays(to, 1));
    const inPeriod = (d: Date) => d >= pStart && d < pEnd;
    const tStart = dayStart(today);
    const tEnd = dayStart(addDays(today, 1));
    const wStart = dayStart(weekStart);
    const mStart = dayStart(monthStart);
    const inToday = (d: Date) => d >= tStart && d < tEnd;
    const inWeek = (d: Date) => d >= wStart && d < tEnd;
    const inMonth = (d: Date) => d >= mStart && d < tEnd;

    const clubWhere = clubId ? { clubId } : {};
    const [reservations, groupSessions, currency] = await Promise.all([
      this.prisma.reservation.findMany({
        where: {
          ...clubWhere,
          type: { in: ['COURT', 'LESSON'] },
          // The coach's own backing booking for a group training is not a sale.
          groupSession: null,
          startsAt: { gte: winStart, lt: winEnd },
        },
        select: {
          userId: true,
          type: true,
          status: true,
          startsAt: true,
          endsAt: true,
          priceCents: true,
          resources: { select: { resource: { select: { type: true, coachProfileId: true } } } },
        },
      }),
      this.prisma.groupSession.findMany({
        where: { ...clubWhere, cancelledAt: null, startsAt: { gte: winStart, lt: winEnd } },
        select: {
          coachProfileId: true,
          startsAt: true,
          endsAt: true,
          priceCents: true,
          registrations: { select: { userId: true } },
        },
      }),
      clubId
        ? this.prisma.club.findUnique({ where: { id: clubId }, select: { currency: true } }).then((c) => c?.currency ?? 'EUR')
        : Promise.resolve('EUR'),
    ]);

    // ── money + bookings ──
    const revenue = { todayCents: 0, weekCents: 0, monthCents: 0, periodCents: 0, pendingCents: 0, groupCents: 0 };
    const bookings = { today: 0, week: 0, month: 0, period: 0, courts: 0, lessons: 0, groupSignups: 0, cancelled: 0, noShows: 0 };
    const daily = new Map<string, DailyStatDto>();
    for (let d = from; d <= to; d = addDays(d, 1)) daily.set(d, { date: d, revenueCents: 0, bookings: 0, newUsers: 0 });
    const active = new Set<number>();
    const coaches = new Map<number, Omit<CoachStatDto, 'name'> & { minutes: number }>();
    const coach = (id: number) => {
      let c = coaches.get(id);
      if (!c) {
        c = { coachProfileId: id, hours: 0, minutes: 0, revenueCents: 0, lessons: 0, groupSessions: 0 };
        coaches.set(id, c);
      }
      return c;
    };
    const earn = (at: Date, cents: number) => {
      if (inToday(at)) revenue.todayCents += cents;
      if (inWeek(at)) revenue.weekCents += cents;
      if (inMonth(at)) revenue.monthCents += cents;
      if (inPeriod(at)) {
        revenue.periodCents += cents;
        daily.get(localDay(at))!.revenueCents += cents;
      }
    };

    for (const r of reservations) {
      const earned = EARNED.has(r.status);
      const live = earned || PENDING.has(r.status);
      if (live) {
        if (inToday(r.startsAt)) bookings.today++;
        if (inWeek(r.startsAt)) bookings.week++;
        if (inMonth(r.startsAt)) bookings.month++;
      }
      if (earned) earn(r.startsAt, r.priceCents);
      if (!inPeriod(r.startsAt)) continue;

      if (r.status === 'CANCELLED' || r.status === 'REFUNDED') bookings.cancelled++;
      if (r.status === 'NO_SHOW') bookings.noShows++;
      if (PENDING.has(r.status)) revenue.pendingCents += r.priceCents;
      if (!live) continue;

      bookings.period++;
      if (r.type === 'LESSON') bookings.lessons++;
      else bookings.courts++;
      daily.get(localDay(r.startsAt))!.bookings++;
      active.add(r.userId);

      if (r.type === 'LESSON' && earned) {
        const id = r.resources.find((x) => x.resource.type === 'COACH')?.resource.coachProfileId;
        if (id) {
          const c = coach(id);
          c.minutes += (r.endsAt.getTime() - r.startsAt.getTime()) / 60_000;
          c.revenueCents += r.priceCents;
          c.lessons++;
        }
      }
    }

    for (const g of groupSessions) {
      const cents = g.priceCents * g.registrations.length;
      earn(g.startsAt, cents);
      if (!inPeriod(g.startsAt)) continue;
      revenue.groupCents += cents;
      bookings.groupSignups += g.registrations.length;
      daily.get(localDay(g.startsAt))!.bookings += g.registrations.length;
      g.registrations.forEach((x) => active.add(x.userId));
      // A group with no one signed up didn't happen as a training.
      if (g.registrations.length > 0) {
        const c = coach(g.coachProfileId);
        c.minutes += (g.endsAt.getTime() - g.startsAt.getTime()) / 60_000;
        c.revenueCents += cents;
        c.groupSessions++;
      }
    }

    // ── users ──
    const users = await this.userStats({ clubId, pStart, pEnd, tStart, tEnd, wStart, mStart, daily, active });

    // ── top coaches ──
    const names = await this.prisma.coachProfile.findMany({
      where: { id: { in: [...coaches.keys()] } },
      select: { id: true, user: { select: { name: true } } },
    });
    const nameBy = new Map(names.map((n) => [n.id, n.user.name]));
    const all: CoachStatDto[] = [...coaches.values()].map(({ minutes, ...c }) => ({
      ...c,
      hours: Math.round((minutes / 60) * 10) / 10,
      name: nameBy.get(c.coachProfileId) ?? `#${c.coachProfileId}`,
    }));
    const top = (key: (c: CoachStatDto) => number) =>
      [...all].filter((c) => key(c) > 0).sort((a, b) => key(b) - key(a) || a.name.localeCompare(b.name)).slice(0, TOP_N);

    return {
      scope,
      range: { from, to, today, weekStart, monthStart, timezone: TZ },
      currency,
      revenue,
      bookings,
      users,
      daily: [...daily.values()],
      topCoaches: {
        byHours: top((c) => c.hours),
        byRevenue: top((c) => c.revenueCents),
        byLessons: top((c) => c.lessons + c.groupSessions),
      },
    };
  }

  private async userStats(a: {
    clubId?: number;
    pStart: Date;
    pEnd: Date;
    tStart: Date;
    tEnd: Date;
    wStart: Date;
    mStart: Date;
    daily: Map<string, DailyStatDto>;
    active: Set<number>;
  }): Promise<AdminStatsDto['users']> {
    const lo = [a.pStart, a.wStart, a.mStart].sort((x, y) => x.getTime() - y.getTime())[0]!;
    const hi = a.pEnd > a.tEnd ? a.pEnd : a.tEnd;

    // "Joined" = account created (platform) or first booking at the club (club).
    let joined: Date[];
    let total: number;
    let suspended: number | null = null;
    if (!a.clubId) {
      const [rows, count, susp] = await Promise.all([
        this.prisma.user.findMany({
          where: { deletedAt: null, createdAt: { gte: lo, lt: hi } },
          select: { createdAt: true },
        }),
        this.prisma.user.count({ where: { deletedAt: null } }),
        this.prisma.user.count({ where: { deletedAt: null, suspendedAt: { not: null } } }),
      ]);
      joined = rows.map((r) => r.createdAt);
      total = count;
      suspended = susp;
    } else {
      const firsts = await this.prisma.reservation.groupBy({
        by: ['userId'],
        where: { clubId: a.clubId, type: { in: ['COURT', 'LESSON'] }, groupSession: null },
        _min: { createdAt: true },
      });
      joined = firsts.map((f) => f._min.createdAt).filter((d): d is Date => d !== null && d >= lo && d < hi);
      total = firsts.length;
    }

    const within = (s: Date, e: Date) => joined.filter((d) => d >= s && d < e).length;
    for (const d of joined) {
      if (d >= a.pStart && d < a.pEnd) {
        const row = a.daily.get(localDay(d));
        if (row) row.newUsers++;
      }
    }
    return {
      total,
      newToday: within(a.tStart, a.tEnd),
      newWeek: within(a.wStart, a.tEnd),
      newMonth: within(a.mStart, a.tEnd),
      newPeriod: within(a.pStart, a.pEnd),
      activePeriod: a.active.size,
      suspended,
    };
  }
}
