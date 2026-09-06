import { Injectable } from '@nestjs/common';
import {
  type AvailabilityQuery,
  type AvailabilityResponse,
  type AvailabilitySlot,
} from '@playslot/contracts';
import { Prisma } from '@playslot/db';
import {
  type Occupancy,
  type OccupancyState,
  type PriceRuleLike,
  PricingError,
  formatInZone,
  generateSlots,
  instantFromDayMinutes,
  intervalsOverlap,
  resolvePrice,
  weekdayInZone,
} from '@playslot/domain';
import { AppException } from '../common/app-exception';
import { PrismaService } from '../prisma/prisma.service';

interface CoachAvail {
  coachProfileId: number;
  rules: { weekday: number; startMin: number; endMin: number }[];
  busy: { start: Date; end: Date }[];
}

// Reservation statuses that occupy inventory for availability (spec §7).
const OCCUPYING_STATUSES = ['CONFIRMED', 'PENDING_PAYMENT', 'HOLD'] as const;

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async getAvailability(query: AvailabilityQuery, userId?: number): Promise<AvailabilityResponse> {
    const club = await this.prisma.club.findFirst({
      where: { id: query.clubId, status: 'ACTIVE' },
      select: { currency: true, timezone: true, slotIntervalMin: true },
    });
    if (!club) throw new AppException('not_found');

    const tz = club.timezone;
    // Booking granularity is a club-wide setting (30 or 60 min); all courts use it.
    const slotIntervalMin = club.slotIntervalMin;
    const allowHalfHour = slotIntervalMin < 60;
    const dayStart = instantFromDayMinutes(query.date, 0, tz);
    const dayEnd = instantFromDayMinutes(query.date, 24 * 60, tz);
    const now = new Date();
    const weekday = weekdayInZone(query.date, tz);

    const courts = await this.prisma.resource.findMany({
      where: {
        clubId: query.clubId,
        type: 'COURT',
        status: 'ACTIVE',
        ...(query.sport ? { sport: query.sport } : {}),
      },
      include: { availabilityRules: true },
      orderBy: { name: 'asc' },
    });
    const courtIds = courts.map((c) => c.id);

    const [exceptions, reservations, priceRules] = await Promise.all([
      this.prisma.resourceException.findMany({
        where: { resourceId: { in: courtIds }, startsAt: { lt: dayEnd }, endsAt: { gt: dayStart } },
      }),
      this.prisma.reservation.findMany({
        where: {
          clubId: query.clubId,
          status: { in: [...OCCUPYING_STATUSES] },
          startsAt: { lt: dayEnd },
          endsAt: { gt: dayStart },
        },
        include: { resources: { select: { resourceId: true } } },
      }),
      this.prisma.priceRule.findMany({ where: { clubId: query.clubId, active: true } }),
    ]);

    // Build per-court occupancy from reservations (uses reservation bounds, which
    // equal the ReservationResource period, avoiding raw tstzrange queries).
    const occByCourt = new Map<number, Occupancy[]>();
    for (const res of reservations) {
      if (res.status === 'HOLD' && (!res.holdExpiresAt || res.holdExpiresAt <= now)) continue;
      const state: OccupancyState =
        res.userId === userId
          ? 'MINE'
          : res.type === 'EVENT'
            ? 'EVENT'
            : res.type === 'TOURNAMENT'
              ? 'TOURNAMENT'
              : 'RESERVED';
      for (const rr of res.resources) {
        if (!courtIds.includes(rr.resourceId)) continue;
        const list = occByCourt.get(rr.resourceId) ?? [];
        list.push({ start: res.startsAt, end: res.endsAt, state });
        occByCourt.set(rr.resourceId, list);
      }
    }

    const priceRuleLikes: PriceRuleLike[] = priceRules.map((r) => ({
      id: r.id,
      resourceId: r.resourceId,
      serviceId: r.serviceId,
      weekdayMask: r.weekdayMask,
      startMin: r.startMin,
      endMin: r.endMin,
      validFrom: r.validFrom,
      validUntil: r.validUntil,
      durationMin: r.durationMin,
      priceCents: r.priceCents,
      currency: r.currency,
      priority: r.priority,
      active: r.active,
    }));

    // Court-first "add coach": which coaches (linked to this club) are free at a
    // slot. Coach occupancy is global (one shared resource across clubs, §10).
    const coaches = await this.loadCoachAvailability(query.clubId, dayStart, dayEnd);

    const slots: AvailabilitySlot[] = [];
    for (const court of courts) {
      const duration = query.duration ?? court.minReservationMin;
      const generated = generateSlots({
        resource: {
          id: court.id,
          slotIntervalMin, // club-wide granularity
          minReservationMin: court.minReservationMin,
          allowHalfHour,
        },
        rules: court.availabilityRules.map((r) => ({
          weekday: r.weekday,
          startMin: r.startMin,
          endMin: r.endMin,
        })),
        closures: exceptions
          .filter((e) => e.resourceId === court.id)
          .map((e) => ({ start: e.startsAt, end: e.endsAt })),
        occupancy: occByCourt.get(court.id) ?? [],
        isoDate: query.date,
        timeZone: tz,
        durationMin: duration,
        now,
      });

      const durationsMin = uniq([court.minReservationMin, duration, duration * 2]).filter(
        (d) => d <= 240,
      );

      for (const slot of generated) {
        let priceCents: number | null = null;
        try {
          priceCents = resolvePrice(priceRuleLikes, {
            weekday,
            slotStartMin: slot.startMin,
            slotEndMin: slot.startMin + duration,
            durationMin: duration,
            date: slot.start,
            resourceId: court.id,
          }).priceCents;
        } catch (e) {
          if (!(e instanceof PricingError)) throw e;
          priceCents = null; // no rule matched; client shows "—" rather than a wrong price
        }

        const coachIds =
          slot.state === 'FREE'
            ? coaches
                .filter(
                  (co) =>
                    co.rules.some(
                      (r) =>
                        r.weekday === weekday &&
                        r.startMin <= slot.startMin &&
                        r.endMin >= slot.startMin + duration,
                    ) && !co.busy.some((b) => intervalsOverlap(b, { start: slot.start, end: slot.end })),
                )
                .map((co) => co.coachProfileId)
            : [];

        slots.push({
          resourceId: court.id,
          start: formatInZone(slot.start, tz),
          end: formatInZone(slot.end, tz),
          state: slot.state,
          priceCents,
          durationsMin,
          coachIds,
          minReservationMin: court.minReservationMin,
          allowHalfHour,
        });
      }
    }

    return {
      date: query.date,
      timezone: tz,
      currency: club.currency,
      slotIntervalMin,
      courts: courts.map((c) => ({
        id: c.id,
        name: c.name,
        surface: c.surface,
        isIndoor: c.isIndoor,
        hasLighting: c.hasLighting,
        minReservationMin: c.minReservationMin,
        allowHalfHour,
      })),
      slots,
    };
  }

  private async loadCoachAvailability(
    clubId: number,
    dayStart: Date,
    dayEnd: Date,
  ): Promise<CoachAvail[]> {
    const links = await this.prisma.coachClub.findMany({
      where: { clubId },
      select: { coachProfileId: true },
    });
    const coachProfileIds = links.map((l) => l.coachProfileId);
    if (coachProfileIds.length === 0) return [];

    const resources = await this.prisma.resource.findMany({
      where: { type: 'COACH', status: 'ACTIVE', coachProfileId: { in: coachProfileIds } },
      include: { availabilityRules: true },
    });
    const resourceIds = resources.map((r) => r.id);
    const busyRows =
      resourceIds.length === 0
        ? []
        : await this.prisma.$queryRaw<Array<{ resourceId: number; startsAt: Date; endsAt: Date }>>(
            Prisma.sql`SELECT rr."resourceId" as "resourceId", r."startsAt" as "startsAt", r."endsAt" as "endsAt"
                       FROM "ReservationResource" rr
                       JOIN "Reservation" r ON r.id = rr."reservationId"
                       WHERE rr."isActive" AND rr."resourceId" IN (${Prisma.join(resourceIds)})
                         AND r."startsAt" < ${dayEnd} AND r."endsAt" > ${dayStart}`,
          );
    const busyByResource = new Map<number, { start: Date; end: Date }[]>();
    for (const row of busyRows) {
      const list = busyByResource.get(row.resourceId) ?? [];
      list.push({ start: row.startsAt, end: row.endsAt });
      busyByResource.set(row.resourceId, list);
    }

    return resources
      .filter((r) => r.coachProfileId !== null)
      .map((r) => ({
        coachProfileId: r.coachProfileId!,
        rules: r.availabilityRules.map((x) => ({
          weekday: x.weekday,
          startMin: x.startMin,
          endMin: x.endMin,
        })),
        busy: busyByResource.get(r.id) ?? [],
      }));
  }
}

function uniq(nums: number[]): number[] {
  return [...new Set(nums)].sort((a, b) => a - b);
}
