import { Injectable } from '@nestjs/common';
import {
  type CoachAvailabilityQuery,
  type CoachAvailabilityResponse,
  type CoachListItem,
  type CoachSlot,
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
    return mapped!;
  }

  private async attachClubs(
    coaches: Array<{
      id: number;
      bio: string | null;
      photoUrl: string | null;
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
