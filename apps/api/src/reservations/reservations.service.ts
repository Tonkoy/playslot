import { forwardRef, Inject, Injectable } from '@nestjs/common';
import type { ServerEnv } from '@playslot/config';
import {
  type CreateReservationInput,
  type CreateReservationResponse,
  type ReservationSummary,
} from '@playslot/contracts';
import { Prisma, type ReservationSource } from '@playslot/db';
import {
  formatInZone,
  instantFromDayMinutes,
  type PriceRuleLike,
  requiresOnlinePayment,
  resolvePrice,
  weekdayInZone,
} from '@playslot/domain';
import { AppException } from '../common/app-exception';
import { SERVER_ENV } from '../config/app-config.module';
import { PrismaService } from '../prisma/prisma.service';
import { HoldQueueService } from './hold-queue.service';

interface Actor {
  userId: number;
  emailVerified: boolean;
}

@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVER_ENV) private readonly env: ServerEnv,
    @Inject(forwardRef(() => HoldQueueService))
    private readonly holds: HoldQueueService,
  ) {}

  /**
   * Create a booking (spec §8). Runs the exact flow: validate → open txn → lock
   * the resources → re-check overlap → insert HOLD + one ReservationResource per
   * resource (the EXCLUDE constraint is the final guard) → confirm or start the
   * payment path. Price is always recomputed server-side.
   */
  async createReservation(
    input: CreateReservationInput,
    actor: Actor,
    source: ReservationSource = 'WEB',
  ): Promise<CreateReservationResponse> {
    const start = new Date(input.startsAt);
    if (Number.isNaN(start.getTime())) {
      throw new AppException('validation_failed', { fields: { startsAt: ['invalid'] } });
    }
    const end = new Date(start.getTime() + input.durationMin * 60_000);

    const club = await this.prisma.club.findFirst({
      where: { id: input.clubId, status: 'ACTIVE' },
      select: { id: true, timezone: true, slotIntervalMin: true, currency: true },
    });
    if (!club) throw new AppException('not_found');

    // Email must be verified before a first confirmed booking (spec §12).
    if (source === 'WEB' && !actor.emailVerified) {
      throw new AppException('policy_violation', { reason: 'email_not_verified' });
    }

    // Timing policy (spec §12): no past bookings, respect max advance window.
    const now = new Date();
    if (start.getTime() <= now.getTime()) {
      throw new AppException('policy_violation', { reason: 'in_past' });
    }
    const maxAdvanceMs = this.env.MAX_ADVANCE_DAYS * 24 * 60 * 60_000;
    if (start.getTime() - now.getTime() > maxAdvanceMs) {
      throw new AppException('policy_violation', { reason: 'beyond_max_advance' });
    }

    // Resolve the local grid position and validate alignment to the club slot time.
    const tz = club.timezone;
    const isoDate = formatInZone(start, tz, 'yyyy-MM-dd');
    const hhmm = formatInZone(start, tz, 'HH:mm');
    const [h, m] = hhmm.split(':').map(Number);
    const startMin = h! * 60 + m!;
    const endMin = startMin + input.durationMin;

    if (instantFromDayMinutes(isoDate, startMin, tz).getTime() !== start.getTime()) {
      throw new AppException('policy_violation', { reason: 'invalid_start' });
    }
    if (startMin % club.slotIntervalMin !== 0 || input.durationMin % club.slotIntervalMin !== 0) {
      throw new AppException('policy_violation', { reason: 'misaligned_slot' });
    }
    if (endMin > 24 * 60) {
      throw new AppException('policy_violation', { reason: 'crosses_midnight' });
    }
    const weekday = weekdayInZone(isoDate, tz);

    // Resources must belong to the club, be ACTIVE, and be open at that time.
    const resources = await this.prisma.resource.findMany({
      where: { id: { in: input.resourceIds }, clubId: club.id, status: 'ACTIVE' },
      include: { availabilityRules: true, exceptions: true },
    });
    if (resources.length !== input.resourceIds.length) {
      throw new AppException('not_found', { reason: 'resource' });
    }
    for (const r of resources) {
      const open = r.availabilityRules.some(
        (rule) => rule.weekday === weekday && rule.startMin <= startMin && rule.endMin >= endMin,
      );
      if (!open) throw new AppException('availability_changed', { reason: 'closed' });
      if (input.durationMin < r.minReservationMin) {
        throw new AppException('policy_violation', { reason: 'below_min_duration' });
      }
      const closed = r.exceptions.some((e) => e.startsAt < end && start < e.endsAt);
      if (closed) throw new AppException('availability_changed', { reason: 'exception' });
    }

    // Recompute the price server-side (golden rule §2.2). Court booking prices on
    // the resource; a single-resource booking prices that resource.
    const priceRules = await this.loadPriceRules(club.id);
    const priceResourceId = resources.length === 1 ? resources[0]!.id : undefined;
    let priceCents: number;
    try {
      priceCents = resolvePrice(priceRules, {
        weekday,
        slotStartMin: startMin,
        slotEndMin: endMin,
        durationMin: input.durationMin,
        date: start,
        resourceId: priceResourceId,
      }).priceCents;
    } catch {
      throw new AppException('policy_violation', { reason: 'no_price' });
    }

    const online = requiresOnlinePayment(input.paymentMethod);
    const holdExpiresAt = new Date(now.getTime() + this.env.HOLD_TTL_MIN * 60_000);

    const reservation = await this.runBookingTransaction({
      clubId: club.id,
      userId: actor.userId,
      type: input.type,
      source,
      start,
      end,
      resourceIds: input.resourceIds,
      priceCents,
      currency: club.currency,
      paymentMethod: input.paymentMethod,
      participants: input.participants ?? null,
      holdExpiresAt,
      online,
    });

    // Only the payment path leaves a live hold to expire (spec §8/§19).
    if (online) {
      await this.holds.scheduleExpiry(reservation.id, holdExpiresAt);
    }

    return {
      reservationId: reservation.id,
      status: reservation.status,
      holdExpiresAt: reservation.holdExpiresAt ? reservation.holdExpiresAt.toISOString() : null,
      priceCents,
      currency: club.currency,
      next: online ? { action: 'PAY' } : { action: 'CONFIRMED' },
    };
  }

  private async runBookingTransaction(args: {
    clubId: number;
    userId: number;
    type: 'COURT' | 'LESSON';
    source: ReservationSource;
    start: Date;
    end: Date;
    resourceIds: number[];
    priceCents: number;
    currency: string;
    paymentMethod: CreateReservationInput['paymentMethod'];
    participants: unknown;
    holdExpiresAt: Date;
    online: boolean;
  }) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Serialize concurrent bookings for these resources (spec §8 step 4).
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM "Resource" WHERE id IN (${Prisma.join(args.resourceIds)}) AND "clubId" = ${args.clubId} FOR UPDATE`,
        );

        // Re-check overlap against active reservations/holds (step 5).
        const conflicts = await tx.$queryRaw<Array<{ one: number }>>(
          Prisma.sql`SELECT 1 as one FROM "ReservationResource"
                     WHERE "isActive" AND "resourceId" IN (${Prisma.join(args.resourceIds)})
                       AND period && tstzrange(${args.start}, ${args.end}, '[)') LIMIT 1`,
        );
        if (conflicts.length > 0) {
          throw new AppException('availability_changed', { reason: 'overlap' });
        }

        const reservation = await tx.reservation.create({
          data: {
            clubId: args.clubId,
            userId: args.userId,
            type: args.type,
            status: 'HOLD',
            source: args.source,
            startsAt: args.start,
            endsAt: args.end,
            priceCents: args.priceCents,
            currency: args.currency,
            paymentMethod: args.paymentMethod,
            holdExpiresAt: args.holdExpiresAt,
            participants: (args.participants ?? undefined) as Prisma.InputJsonValue | undefined,
          },
        });

        // One ReservationResource per resource; the EXCLUDE constraint is the
        // final guard — a concurrent overlapping insert throws 23P01 (step 7).
        for (const resourceId of args.resourceIds) {
          await tx.$executeRaw(
            Prisma.sql`INSERT INTO "ReservationResource" ("reservationId", "resourceId", period, "isActive")
                       VALUES (${reservation.id}, ${resourceId}, tstzrange(${args.start}, ${args.end}, '[)'), true)`,
          );
        }

        // On-site/free/multisport confirm immediately; online waits for payment.
        const nextStatus = args.online ? 'PENDING_PAYMENT' : 'CONFIRMED';
        const updated = await tx.reservation.update({
          where: { id: reservation.id },
          data: {
            status: nextStatus,
            holdExpiresAt: args.online ? args.holdExpiresAt : null,
          },
        });

        await tx.auditLog.create({
          data: {
            actorUserId: args.userId,
            action: `reservation.${nextStatus.toLowerCase()}`,
            objectType: 'Reservation',
            objectId: reservation.id,
            after: { status: nextStatus, priceCents: args.priceCents } as Prisma.InputJsonValue,
          },
        });

        return updated;
      });
    } catch (e) {
      if (isExclusionViolation(e)) {
        throw new AppException('availability_changed', { reason: 'overlap' });
      }
      throw e;
    }
  }

  /**
   * Expire a hold if still unpaid (idempotent — safe to run twice). Called by the
   * BullMQ worker; also directly callable/testable without Redis.
   */
  async expireHold(reservationId: number): Promise<void> {
    const reservation = await this.prisma.reservation.findUnique({ where: { id: reservationId } });
    if (!reservation) return;
    if (reservation.status !== 'HOLD' && reservation.status !== 'PENDING_PAYMENT') return;
    if (reservation.holdExpiresAt && reservation.holdExpiresAt > new Date()) return; // not due yet

    await this.prisma.reservation.update({
      where: { id: reservationId },
      data: { status: 'CANCELLED', cancellationReason: 'hold_expired' },
    });
    // The isActive trigger releases the ReservationResource rows automatically.
  }

  async cancel(reservationId: number, userId: number, roles: string[], reason?: string) {
    const reservation = await this.prisma.reservation.findUnique({ where: { id: reservationId } });
    if (!reservation) throw new AppException('not_found');

    const isOwner = reservation.userId === userId;
    const isStaff = await this.isClubStaff(reservation.clubId, userId, roles);
    if (!isOwner && !isStaff) throw new AppException('forbidden');

    if (!['HOLD', 'PENDING_PAYMENT', 'CONFIRMED'].includes(reservation.status)) {
      throw new AppException('policy_violation', { reason: 'not_cancellable' });
    }

    await this.prisma.reservation.update({
      where: { id: reservationId },
      data: { status: 'CANCELLED', cancellationReason: reason ?? 'user_cancelled' },
    });
    // Refund computation per policy is Phase 6; inventory is released by the trigger.
    return { status: 'CANCELLED' as const, refundCents: 0, refundStatus: 'NONE' as const };
  }

  async listMine(userId: number): Promise<ReservationSummary[]> {
    const rows = await this.prisma.reservation.findMany({
      where: { userId },
      orderBy: { startsAt: 'desc' },
      include: { resources: { select: { resourceId: true } }, club: { select: { name: true } } },
      take: 100,
    });
    return rows.map((r) => this.toSummary(r));
  }

  async getOne(id: number, userId: number, roles: string[]): Promise<ReservationSummary> {
    const r = await this.prisma.reservation.findUnique({
      where: { id },
      include: { resources: { select: { resourceId: true } }, club: { select: { name: true } } },
    });
    if (!r) throw new AppException('not_found');
    const isStaff = await this.isClubStaff(r.clubId, userId, roles);
    if (r.userId !== userId && !isStaff) throw new AppException('forbidden');
    return this.toSummary(r);
  }

  // ── helpers ──
  private toSummary(r: {
    id: number;
    clubId: number;
    type: string;
    status: string;
    startsAt: Date;
    endsAt: Date;
    priceCents: number;
    currency: string;
    paymentMethod: string;
    resources: { resourceId: number }[];
    club?: { name: string };
  }): ReservationSummary {
    return {
      id: r.id,
      clubId: r.clubId,
      clubName: r.club?.name,
      type: r.type,
      status: r.status,
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
      priceCents: r.priceCents,
      currency: r.currency,
      paymentMethod: r.paymentMethod,
      resourceIds: r.resources.map((x) => x.resourceId),
    };
  }

  private async isClubStaff(clubId: number, userId: number, roles: string[]): Promise<boolean> {
    if (roles.includes('PLATFORM_ADMIN')) return true;
    const member = await this.prisma.clubMember.findFirst({
      where: { clubId, userId, status: 'ACTIVE', role: { in: ['CLUB_STAFF', 'CLUB_ADMIN'] } },
    });
    return member !== null;
  }

  private async loadPriceRules(clubId: number): Promise<PriceRuleLike[]> {
    const rules = await this.prisma.priceRule.findMany({ where: { clubId, active: true } });
    return rules.map((r) => ({
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
  }
}

/** Postgres exclusion_violation (23P01) surfaced through Prisma raw queries. */
function isExclusionViolation(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    // P2010 = raw query failed; the DB code/message carries 23P01.
    const meta = e.meta as { code?: string; message?: string } | undefined;
    if (meta?.code === '23P01') return true;
    if (typeof meta?.message === 'string' && meta.message.includes('no_resource_overlap')) return true;
  }
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes('no_resource_overlap') || msg.includes('23P01');
}
