import { Injectable } from '@nestjs/common';
import {
  type CoachAvailabilityQuery,
  type CoachAvailabilityResponse,
  type CoachListItem,
  type CoachHoursResponse,
  type CoachProfileDto,
  type CoachScheduleDay,
  type CoachScheduleLesson,
  type CoachScheduleResponse,
  type CoachSlot,
  type UpdateCoachHoursInput,
  type UpdateCoachProfileInput,
} from '@playslot/contracts';
import { Prisma } from '@playslot/db';
import {
  formatInZone,
  generateSlots,
  instantFromDayMinutes,
  intervalsOverlap,
  weekdayInZone,
} from '@playslot/domain';
import { AppException } from '../common/app-exception';
import { PrismaService } from '../prisma/prisma.service';

interface Interval {
  start: Date;
  end: Date;
}

@Injectable()
export class CoachingService {
  constructor(private readonly prisma: PrismaService) {}

  // ── directory ──
  async listCoaches(clubId?: number): Promise<CoachListItem[]> {
    const coaches = await this.prisma.coachProfile.findMany({
      where: clubId ? { clubs: { some: { clubId } } } : {},
      include: {
        user: { select: { name: true } },
        services: { orderBy: { id: 'asc' } },
        clubs: true,
      },
      orderBy: { id: 'asc' },
    });
    return this.attachClubs(coaches);
  }

  async getCoach(coachProfileId: number): Promise<CoachListItem> {
    const coach = await this.prisma.coachProfile.findUnique({
      where: { id: coachProfileId },
      include: { user: { select: { name: true } }, services: { orderBy: { id: 'asc' } }, clubs: true },
    });
    if (!coach) throw new AppException('not_found');
    const [mapped] = await this.attachClubs([coach]);
    // Working hours from the coach's shared resource (public on the single view).
    const resource = await this.prisma.resource.findFirst({
      where: { coachProfileId, type: 'COACH' },
      select: { availabilityRules: { orderBy: [{ weekday: 'asc' }, { startMin: 'asc' }] } },
    });
    return {
      ...mapped!,
      workingHours: (resource?.availabilityRules ?? []).map((r) => ({
        weekday: r.weekday,
        startMin: r.startMin,
        endMin: r.endMin,
      })),
    };
  }

  private async attachClubs(
    coaches: Array<{
      id: number;
      bio: string | null;
      photoUrl: string | null;
      hourlyRateCents: number | null;
      languages: string[];
      levels: string[];
      user: { name: string } | null;
      services: { id: number; name: string; durationMin: number; minPlayers: number; maxPlayers: number; priceCents: number }[];
      clubs: { clubId: number }[];
    }>,
  ): Promise<CoachListItem[]> {
    const clubIds = [...new Set(coaches.flatMap((c) => c.clubs.map((x) => x.clubId)))];
    const clubs = await this.prisma.club.findMany({
      where: { id: { in: clubIds }, status: 'ACTIVE' },
      select: { id: true, name: true, slug: true },
    });
    const byId = new Map(clubs.map((c) => [c.id, c]));
    return coaches.map((c) => ({
      coachProfileId: c.id,
      name: c.user?.name ?? 'Coach',
      bio: c.bio,
      photoUrl: c.photoUrl,
      hourlyRateCents: c.hourlyRateCents,
      languages: c.languages,
      levels: c.levels,
      clubs: c.clubs.map((x) => byId.get(x.clubId)).filter((x): x is NonNullable<typeof x> => !!x),
      services: c.services.map((s) => ({
        id: s.id,
        name: s.name,
        durationMin: s.durationMin,
        minPlayers: s.minPlayers,
        maxPlayers: s.maxPlayers,
        priceCents: s.priceCents,
      })),
    }));
  }

  // ── coach-first availability (spec §7): coach free time ∩ compatible courts ──
  async getCoachAvailability(
    coachProfileId: number,
    query: CoachAvailabilityQuery,
  ): Promise<CoachAvailabilityResponse> {
    const club = await this.prisma.club.findFirst({
      where: { id: query.clubId, status: 'ACTIVE' },
      select: { timezone: true, slotIntervalMin: true, currency: true },
    });
    if (!club) throw new AppException('not_found');

    const link = await this.prisma.coachClub.findFirst({
      where: { coachProfileId, clubId: query.clubId },
    });
    if (!link) throw new AppException('not_found', { reason: 'coach_not_at_club' });

    const coachResource = await this.prisma.resource.findFirst({
      where: { coachProfileId, type: 'COACH', status: 'ACTIVE' },
      include: { availabilityRules: true },
    });
    if (!coachResource) throw new AppException('not_found', { reason: 'coach_resource' });

    let durationMin = club.slotIntervalMin;
    if (query.serviceId) {
      const service = await this.prisma.coachService.findFirst({
        where: { id: query.serviceId, coachProfileId },
      });
      if (!service) throw new AppException('not_found', { reason: 'service' });
      durationMin = service.durationMin;
    }

    const tz = club.timezone;
    const dayStart = instantFromDayMinutes(query.date, 0, tz);
    const dayEnd = instantFromDayMinutes(query.date, 24 * 60, tz);
    const now = new Date();
    const weekday = weekdayInZone(query.date, tz);

    // Coach occupancy is GLOBAL (across all clubs) — one shared resource (§10).
    const coachBusy = (await this.occupiedIntervals([coachResource.id], dayStart, dayEnd)).get(
      coachResource.id,
    ) ?? [];

    const coachSlots = generateSlots({
      resource: {
        id: coachResource.id,
        slotIntervalMin: club.slotIntervalMin,
        minReservationMin: coachResource.minReservationMin,
        allowHalfHour: club.slotIntervalMin < 60,
      },
      rules: coachResource.availabilityRules.map((r) => ({
        weekday: r.weekday,
        startMin: r.startMin,
        endMin: r.endMin,
      })),
      closures: [],
      occupancy: coachBusy.map((b) => ({ ...b, state: 'RESERVED' as const })),
      isoDate: query.date,
      timeZone: tz,
      durationMin,
      now,
    });

    // Compatible courts at this club for the same window.
    const courts = await this.prisma.resource.findMany({
      where: { clubId: query.clubId, type: 'COURT', status: 'ACTIVE' },
      include: { availabilityRules: true, exceptions: true },
    });
    const courtBusy = await this.occupiedIntervals(courts.map((c) => c.id), dayStart, dayEnd);

    const slots: CoachSlot[] = coachSlots.map((slot) => {
      const compatibleCourtIds =
        slot.state === 'FREE'
          ? courts
              .filter((court) => {
                const open = court.availabilityRules.some(
                  (r) => r.weekday === weekday && r.startMin <= slot.startMin && r.endMin >= slot.startMin + durationMin,
                );
                if (!open) return false;
                if (court.exceptions.some((e) => intervalsOverlap({ start: e.startsAt, end: e.endsAt }, slot))) {
                  return false;
                }
                const busy = courtBusy.get(court.id) ?? [];
                return !busy.some((b) => intervalsOverlap(b, slot));
              })
              .map((c) => c.id)
          : [];
      return {
        start: formatInZone(slot.start, tz),
        end: formatInZone(slot.end, tz),
        state: compatibleCourtIds.length === 0 && slot.state === 'FREE' ? 'UNAVAILABLE' : slot.state,
        compatibleCourtIds,
      };
    });

    return {
      coachProfileId,
      clubId: query.clubId,
      date: query.date,
      timezone: tz,
      currency: club.currency,
      slots,
    };
  }

  /**
   * The signed-in coach's own lessons for a 7-day window (spec §19). Times are
   * bucketed into day columns in the coach's timezone. `from` defaults to today.
   */
  async getMySchedule(userId: number, fromDate?: string): Promise<CoachScheduleResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true, coachProfile: { select: { id: true } } },
    });
    if (!user?.coachProfile) throw new AppException('forbidden', { reason: 'not_a_coach' });
    const tz = user.timezone || 'Europe/Sofia';
    const from = fromDate ?? formatInZone(new Date(), tz, 'yyyy-MM-dd');

    // Consecutive calendar dates for the labels (timezone-independent), plus the
    // absolute window bounds anchored to local midnight in the coach timezone.
    const [y, m, d] = from.split('-').map(Number);
    const dateAt = (offset: number) => new Date(Date.UTC(y!, m! - 1, d! + offset)).toISOString().slice(0, 10);
    const toDate = dateAt(7);
    const start = instantFromDayMinutes(from, 0, tz);
    const end = instantFromDayMinutes(toDate, 0, tz);

    const coachResource = await this.prisma.resource.findFirst({
      where: { coachProfileId: user.coachProfile.id, type: 'COACH' },
      select: { id: true },
    });

    const rows = coachResource
      ? await this.prisma.reservation.findMany({
          where: {
            type: 'LESSON',
            status: { in: ['CONFIRMED', 'PENDING_PAYMENT'] },
            startsAt: { gte: start, lt: end },
            resources: { some: { resourceId: coachResource.id, isActive: true } },
          },
          orderBy: { startsAt: 'asc' },
          include: {
            club: { select: { name: true } },
            user: { select: { name: true, email: true } },
            resources: { select: { resource: { select: { type: true, name: true } } } },
          },
        })
      : [];

    const byDate = new Map<string, CoachScheduleLesson[]>();
    for (const r of rows) {
      const dateKey = formatInZone(r.startsAt, tz, 'yyyy-MM-dd');
      const walkin = r.user?.email.endsWith('@walkin.playslot.local') ?? true;
      const part = r.participants as { name?: string; group?: boolean } | null;
      // A coach-hosted group session is booked under the coach — show its title.
      const customerName = part?.group
        ? part.name ?? 'Group session'
        : (!walkin ? r.user?.name : undefined) ?? part?.name ?? 'PlaySlot customer';
      const courtName =
        r.resources.map((x) => x.resource).find((res) => res.type === 'COURT')?.name ?? null;
      const list = byDate.get(dateKey) ?? [];
      list.push({
        reservationId: r.id,
        startsAt: r.startsAt.toISOString(),
        endsAt: r.endsAt.toISOString(),
        time: formatInZone(r.startsAt, tz, 'HH:mm'),
        clubName: r.club.name,
        customerName,
        courtName,
        status: r.status,
      });
      byDate.set(dateKey, list);
    }

    const days: CoachScheduleDay[] = [];
    for (let i = 0; i < 7; i++) {
      const date = dateAt(i);
      days.push({
        date,
        weekday: new Date(`${date}T00:00:00Z`).getUTCDay(),
        lessons: byDate.get(date) ?? [],
      });
    }

    return { timezone: tz, from, to: toDate, days };
  }

  // ── coach's own working hours (spec §7: coach sets bookable time) ──

  /** The signed-in coach's weekly working hours (only working days returned). */
  async getMyHours(userId: number): Promise<CoachHoursResponse> {
    const { tz, resourceId } = await this.coachResourceOf(userId);
    const rules = await this.prisma.availabilityRule.findMany({
      where: { resourceId },
      orderBy: [{ weekday: 'asc' }, { startMin: 'asc' }],
    });
    return {
      timezone: tz,
      days: rules.map((r) => ({ weekday: r.weekday, startMin: r.startMin, endMin: r.endMin })),
    };
  }

  /** Replace the coach's working hours (one interval per weekday; omit = day off). */
  async updateMyHours(userId: number, input: UpdateCoachHoursInput): Promise<CoachHoursResponse> {
    const { resourceId } = await this.coachResourceOf(userId);
    // One interval per weekday for MVP — a later entry for the same day wins.
    const byDay = new Map<number, { weekday: number; startMin: number; endMin: number }>();
    for (const d of input.days) byDay.set(d.weekday, d);
    await this.prisma.$transaction([
      this.prisma.availabilityRule.deleteMany({ where: { resourceId } }),
      this.prisma.availabilityRule.createMany({
        data: [...byDay.values()].map((d) => ({
          resourceId,
          weekday: d.weekday,
          startMin: d.startMin,
          endMin: d.endMin,
        })),
      }),
    ]);
    return this.getMyHours(userId);
  }

  // ── coach's own public profile ──

  async getMyProfile(userId: number): Promise<CoachProfileDto> {
    const profile = await this.prisma.coachProfile.findFirst({ where: { userId } });
    if (!profile) throw new AppException('forbidden', { reason: 'not_a_coach' });
    return {
      coachProfileId: profile.id,
      bio: profile.bio,
      photoUrl: profile.photoUrl,
      hourlyRateCents: profile.hourlyRateCents,
      languages: profile.languages,
      levels: profile.levels,
    };
  }

  async updateMyProfile(userId: number, input: UpdateCoachProfileInput): Promise<CoachProfileDto> {
    const profile = await this.prisma.coachProfile.findFirst({ where: { userId }, select: { id: true } });
    if (!profile) throw new AppException('forbidden', { reason: 'not_a_coach' });
    await this.prisma.coachProfile.update({
      where: { id: profile.id },
      data: {
        ...(input.bio !== undefined ? { bio: input.bio || null } : {}),
        ...(input.photoUrl !== undefined ? { photoUrl: input.photoUrl || null } : {}),
        ...(input.hourlyRateCents !== undefined ? { hourlyRateCents: input.hourlyRateCents ?? null } : {}),
        ...(input.levels !== undefined ? { levels: input.levels } : {}),
        ...(input.languages !== undefined ? { languages: input.languages } : {}),
      },
    });
    return this.getMyProfile(userId);
  }

  /** Resolve the signed-in user's shared COACH resource (throws if not a coach). */
  private async coachResourceOf(userId: number): Promise<{ tz: string; resourceId: number }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true, coachProfile: { select: { id: true } } },
    });
    if (!user?.coachProfile) throw new AppException('forbidden', { reason: 'not_a_coach' });
    const resource = await this.prisma.resource.findFirst({
      where: { coachProfileId: user.coachProfile.id, type: 'COACH' },
      select: { id: true },
    });
    if (!resource) throw new AppException('not_found', { reason: 'coach_resource' });
    return { tz: user.timezone || 'Europe/Sofia', resourceId: resource.id };
  }

  /** Active-reservation intervals per resource for a day (uses reservation bounds). */
  private async occupiedIntervals(
    resourceIds: number[],
    dayStart: Date,
    dayEnd: Date,
  ): Promise<Map<number, Interval[]>> {
    const out = new Map<number, Interval[]>();
    if (resourceIds.length === 0) return out;
    const rows = await this.prisma.$queryRaw<Array<{ resourceId: number; startsAt: Date; endsAt: Date }>>(
      Prisma.sql`SELECT rr."resourceId" as "resourceId", r."startsAt" as "startsAt", r."endsAt" as "endsAt"
                 FROM "ReservationResource" rr
                 JOIN "Reservation" r ON r.id = rr."reservationId"
                 WHERE rr."isActive" AND rr."resourceId" IN (${Prisma.join(resourceIds)})
                   AND r."startsAt" < ${dayEnd} AND r."endsAt" > ${dayStart}`,
    );
    for (const row of rows) {
      const list = out.get(row.resourceId) ?? [];
      list.push({ start: row.startsAt, end: row.endsAt });
      out.set(row.resourceId, list);
    }
    return out;
  }
}
