import { Injectable } from '@nestjs/common';
import {
  type AvailabilityQuery,
  type AvailabilityResponse,
  type AvailabilitySlot,
} from '@playslot/contracts';
import {
  type Occupancy,
  type OccupancyState,
  type PriceRuleLike,
  PricingError,
  formatInZone,
  generateSlots,
  instantFromDayMinutes,
  resolvePrice,
  weekdayInZone,
} from '@playslot/domain';
import { AppException } from '../common/app-exception';
import { PrismaService } from '../prisma/prisma.service';

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

        slots.push({
          resourceId: court.id,
          start: formatInZone(slot.start, tz),
          end: formatInZone(slot.end, tz),
          state: slot.state,
          priceCents,
          durationsMin,
          coachIds: [], // populated in Phase 5 (coaching)
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
}

function uniq(nums: number[]): number[] {
  return [...new Set(nums)].sort((a, b) => a - b);
}
