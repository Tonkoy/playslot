import { forwardRef, Inject, Injectable } from '@nestjs/common';
import type { ServerEnv } from '@playslot/config';
import {
  type BlockInput,
  type CalendarResponse,
  type CreateReservationInput,
  type CreateReservationResponse,
  type ManualBookingInput,
  type ReservationSummary,
  type RescheduleInput,
} from '@playslot/contracts';
import { Prisma, type PaymentMethod, type ReservationSource, type ReservationType } from '@playslot/db';
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

interface ResolvedSlot {
  clubId: number;
  timezone: string;
  currency: string;
  slotIntervalMin: number;
  start: Date;
  end: Date;
  weekday: number;
  startMin: number;
  endMin: number;
  resourceIds: number[];
}

@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVER_ENV) private readonly env: ServerEnv,
    @Inject(forwardRef(() => HoldQueueService))
    private readonly holds: HoldQueueService,
  ) {}

  // ── player self-booking (spec §8) ──
  async createReservation(
    input: CreateReservationInput,
    actor: Actor,
    source: ReservationSource = 'WEB',
  ): Promise<CreateReservationResponse> {
    if (source === 'WEB' && !actor.emailVerified) {
      throw new AppException('policy_violation', { reason: 'email_not_verified' });
    }

    const slot = await this.resolveSlot({
      clubId: input.clubId,
      startsAt: input.startsAt,
      durationMin: input.durationMin,
      resourceIds: input.resourceIds,
      enforceHours: true,
    });

    const priceCents = this.priceFor(await this.loadPriceRules(slot.clubId), slot);
    const online = requiresOnlinePayment(input.paymentMethod);
    const holdExpiresAt = new Date(Date.now() + this.env.HOLD_TTL_MIN * 60_000);

    const reservation = await this.runBookingTransaction({
      slot,
      userId: actor.userId,
      actorUserId: actor.userId,
      type: input.type,
      source,
      priceCents,
      paymentMethod: input.paymentMethod,
      participants: input.participants ?? null,
      holdExpiresAt,
      finalStatus: online ? 'PENDING_PAYMENT' : 'CONFIRMED',
    });

    if (online) await this.holds.scheduleExpiry(reservation.id, holdExpiresAt);

    return {
      reservationId: reservation.id,
      status: reservation.status,
      holdExpiresAt: reservation.holdExpiresAt ? reservation.holdExpiresAt.toISOString() : null,
      priceCents,
      currency: slot.currency,
      next: online ? { action: 'PAY' } : { action: 'CONFIRMED' },
    };
  }

  // ── staff manual/phone booking (spec §16) — same inventory, confirmed at once ──
  async createManual(clubId: number, input: ManualBookingInput, staffUserId: number) {
    const slot = await this.resolveSlot({
      clubId,
      startsAt: input.startsAt,
      durationMin: input.durationMin,
      resourceIds: input.resourceIds,
      enforceHours: true,
    });
    const customerUserId = await this.resolveCustomer(clubId, input);
    const priceCents = this.priceFor(await this.loadPriceRules(clubId), slot);

    const reservation = await this.runBookingTransaction({
      slot,
      userId: customerUserId,
      actorUserId: staffUserId,
      type: input.type,
      source: 'CLUB_STAFF',
      priceCents,
      paymentMethod: input.paymentMethod,
      participants: input.customer ? { name: input.customer.name } : null,
      holdExpiresAt: null,
      finalStatus: 'CONFIRMED',
    });
    return { reservationId: reservation.id, status: reservation.status, priceCents, currency: slot.currency };
  }

  // ── block a resource (maintenance/closure) ──
  async createBlock(clubId: number, input: BlockInput, staffUserId: number) {
    const slot = await this.resolveSlot({
      clubId,
      startsAt: input.startsAt,
      durationMin: input.durationMin,
      resourceIds: input.resourceIds,
      enforceHours: false, // staff may block outside operating hours
      allowMidnightCross: true,
    });

    const reservation = await this.runBookingTransaction({
      slot,
      userId: staffUserId,
      actorUserId: staffUserId,
      type: 'BLOCK',
      source: 'CLUB_STAFF',
      priceCents: 0,
      paymentMethod: 'FREE',
      participants: input.reason ? { reason: input.reason } : null,
      holdExpiresAt: null,
      finalStatus: 'CONFIRMED',
    });
    return { reservationId: reservation.id, status: reservation.status };
  }

  // ── move / reschedule / change court (re-runs conflict logic) ──
  async reschedule(clubId: number, reservationId: number, input: RescheduleInput, staffUserId: number) {
    const existing = await this.prisma.reservation.findFirst({ where: { id: reservationId, clubId } });
    if (!existing) throw new AppException('not_found');
    if (!['HOLD', 'PENDING_PAYMENT', 'CONFIRMED'].includes(existing.status)) {
      throw new AppException('policy_violation', { reason: 'not_reschedulable' });
    }

    const slot = await this.resolveSlot({
      clubId,
      startsAt: input.startsAt,
      durationMin: input.durationMin,
      resourceIds: input.resourceIds,
      enforceHours: existing.type === 'COURT' || existing.type === 'LESSON',
      allowMidnightCross: existing.type === 'BLOCK',
    });
    const priceCents =
      existing.type === 'BLOCK' ? 0 : this.priceFor(await this.loadPriceRules(clubId), slot);

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        // Drop old resource rows so they don't self-conflict, then re-insert.
        await tx.$executeRaw(
          Prisma.sql`DELETE FROM "ReservationResource" WHERE "reservationId" = ${reservationId}`,
        );
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM "Resource" WHERE id IN (${Prisma.join(slot.resourceIds)}) AND "clubId" = ${clubId} FOR UPDATE`,
        );
        const conflicts = await tx.$queryRaw<Array<{ one: number }>>(
          Prisma.sql`SELECT 1 as one FROM "ReservationResource"
                     WHERE "isActive" AND "resourceId" IN (${Prisma.join(slot.resourceIds)})
                       AND period && tstzrange(${slot.start}, ${slot.end}, '[)') LIMIT 1`,
        );
        if (conflicts.length > 0) throw new AppException('availability_changed', { reason: 'overlap' });

        const active = ['HOLD', 'PENDING_PAYMENT', 'CONFIRMED', 'COMPLETED'].includes(existing.status);
        for (const resourceId of slot.resourceIds) {
          await tx.$executeRaw(
            Prisma.sql`INSERT INTO "ReservationResource" ("reservationId", "resourceId", period, "isActive")
                       VALUES (${reservationId}, ${resourceId}, tstzrange(${slot.start}, ${slot.end}, '[)'), ${active})`,
          );
        }
        const res = await tx.reservation.update({
          where: { id: reservationId },
          data: { startsAt: slot.start, endsAt: slot.end, priceCents },
        });
        await this.audit(tx, staffUserId, 'reservation.rescheduled', reservationId, {
          startsAt: slot.start.toISOString(),
          resourceIds: slot.resourceIds,
        });
        return res;
      });
      return { id: updated.id, startsAt: updated.startsAt.toISOString(), priceCents };
    } catch (e) {
      if (isExclusionViolation(e)) throw new AppException('availability_changed', { reason: 'overlap' });
      throw e;
    }
  }

  async markPaid(clubId: number, reservationId: number, staffUserId: number) {
    const r = await this.prisma.reservation.findFirst({ where: { id: reservationId, clubId } });
    if (!r) throw new AppException('not_found');
    await this.prisma.payment.upsert({
      where: { reservationId },
      create: {
        reservationId,
        provider: 'manual',
        amountCents: r.priceCents,
        currency: r.currency,
        status: 'CAPTURED',
        capturedAt: new Date(),
      },
      update: { status: 'CAPTURED', capturedAt: new Date() },
    });
    await this.audit(this.prisma, staffUserId, 'reservation.marked_paid', reservationId, {});
    return { id: reservationId, paymentStatus: 'CAPTURED' as const };
  }

  async markNoShow(clubId: number, reservationId: number, staffUserId: number) {
    const r = await this.prisma.reservation.findFirst({ where: { id: reservationId, clubId } });
    if (!r) throw new AppException('not_found');
    if (r.status !== 'CONFIRMED') throw new AppException('policy_violation', { reason: 'not_confirmed' });
    if (r.startsAt > new Date()) throw new AppException('policy_violation', { reason: 'not_started' });
    await this.prisma.reservation.update({ where: { id: reservationId }, data: { status: 'NO_SHOW' } });
    await this.audit(this.prisma, staffUserId, 'reservation.no_show', reservationId, {});
    return { id: reservationId, status: 'NO_SHOW' as const };
  }

  // ── calendar & customers ──
  async getCalendar(clubId: number, isoDate: string): Promise<CalendarResponse> {
    const club = await this.prisma.club.findFirst({
      where: { id: clubId },
      select: { timezone: true, slotIntervalMin: true },
    });
    if (!club) throw new AppException('not_found');
    const tz = club.timezone;
    const dayStart = instantFromDayMinutes(isoDate, 0, tz);
    const dayEnd = instantFromDayMinutes(isoDate, 24 * 60, tz);

    const [courts, reservations] = await Promise.all([
      this.prisma.resource.findMany({
        where: { clubId, type: 'COURT' },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.reservation.findMany({
        where: {
          clubId,
          status: { in: ['HOLD', 'PENDING_PAYMENT', 'CONFIRMED', 'COMPLETED', 'NO_SHOW'] },
          startsAt: { lt: dayEnd },
          endsAt: { gt: dayStart },
        },
        include: {
          resources: { select: { resourceId: true } },
          user: { select: { name: true } },
          payment: { select: { status: true } },
        },
      }),
    ]);

    return {
      date: isoDate,
      timezone: tz,
      slotIntervalMin: club.slotIntervalMin,
      courts,
      entries: reservations.map((r) => ({
        id: r.id,
        type: r.type,
        status: r.status,
        source: r.source,
        // Offset-aware ISO so the UI reads local wall-clock from HH:mm (like /availability).
        startsAt: formatInZone(r.startsAt, tz),
        endsAt: formatInZone(r.endsAt, tz),
        resourceIds: r.resources.map((x) => x.resourceId),
        customerName: r.type === 'BLOCK' ? null : (r.user?.name ?? null),
        priceCents: r.priceCents,
        currency: r.currency,
        paymentMethod: r.paymentMethod,
        paymentStatus: r.payment?.status ?? null,
      })),
    };
  }

  async listCustomers(clubId: number) {
    const rows = await this.prisma.reservation.findMany({
      where: { clubId, type: { in: ['COURT', 'LESSON'] } },
      distinct: ['userId'],
      select: { user: { select: { id: true, name: true, email: true, phone: true } } },
      orderBy: { userId: 'asc' },
    });
    return rows.map((r) => r.user);
  }

  // ── hold expiry + cancel + reads (spec §6) ──
  async expireHold(reservationId: number): Promise<void> {
    const r = await this.prisma.reservation.findUnique({ where: { id: reservationId } });
    if (!r) return;
    if (r.status !== 'HOLD' && r.status !== 'PENDING_PAYMENT') return;
    if (r.holdExpiresAt && r.holdExpiresAt > new Date()) return;
    await this.prisma.reservation.update({
      where: { id: reservationId },
      data: { status: 'CANCELLED', cancellationReason: 'hold_expired' },
    });
  }

  async cancel(reservationId: number, userId: number, roles: string[], reason?: string) {
    const r = await this.prisma.reservation.findUnique({ where: { id: reservationId } });
    if (!r) throw new AppException('not_found');
    const isOwner = r.userId === userId;
    const isStaff = await this.isClubStaff(r.clubId, userId, roles);
    if (!isOwner && !isStaff) throw new AppException('forbidden');
    if (!['HOLD', 'PENDING_PAYMENT', 'CONFIRMED'].includes(r.status)) {
      throw new AppException('policy_violation', { reason: 'not_cancellable' });
    }
    await this.prisma.reservation.update({
      where: { id: reservationId },
      data: { status: 'CANCELLED', cancellationReason: reason ?? 'user_cancelled' },
    });
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

  // ── shared internals ──
  private async resolveSlot(opts: {
    clubId: number;
    startsAt: string;
    durationMin: number;
    resourceIds: number[];
    enforceHours: boolean;
    allowMidnightCross?: boolean;
  }): Promise<ResolvedSlot> {
    const start = new Date(opts.startsAt);
    if (Number.isNaN(start.getTime())) {
      throw new AppException('validation_failed', { fields: { startsAt: ['invalid'] } });
    }
    const end = new Date(start.getTime() + opts.durationMin * 60_000);

    const club = await this.prisma.club.findFirst({
      where: { id: opts.clubId, status: 'ACTIVE' },
      select: { id: true, timezone: true, slotIntervalMin: true, currency: true },
    });
    if (!club) throw new AppException('not_found');

    const now = new Date();
    if (start.getTime() <= now.getTime()) throw new AppException('policy_violation', { reason: 'in_past' });
    if (start.getTime() - now.getTime() > this.env.MAX_ADVANCE_DAYS * 86_400_000) {
      throw new AppException('policy_violation', { reason: 'beyond_max_advance' });
    }

    const tz = club.timezone;
    const isoDate = formatInZone(start, tz, 'yyyy-MM-dd');
    const [h, m] = formatInZone(start, tz, 'HH:mm').split(':').map(Number);
    const startMin = h! * 60 + m!;
    const endMin = startMin + opts.durationMin;

    if (instantFromDayMinutes(isoDate, startMin, tz).getTime() !== start.getTime()) {
      throw new AppException('policy_violation', { reason: 'invalid_start' });
    }
    if (startMin % club.slotIntervalMin !== 0 || opts.durationMin % club.slotIntervalMin !== 0) {
      throw new AppException('policy_violation', { reason: 'misaligned_slot' });
    }
    if (!opts.allowMidnightCross && endMin > 24 * 60) {
      throw new AppException('policy_violation', { reason: 'crosses_midnight' });
    }
    const weekday = weekdayInZone(isoDate, tz);

    const resources = await this.prisma.resource.findMany({
      where: { id: { in: opts.resourceIds }, clubId: club.id, status: 'ACTIVE' },
      include: { availabilityRules: true, exceptions: true },
    });
    if (resources.length !== opts.resourceIds.length) {
      throw new AppException('not_found', { reason: 'resource' });
    }
    for (const r of resources) {
      if (opts.enforceHours) {
        const open = r.availabilityRules.some(
          (rule) => rule.weekday === weekday && rule.startMin <= startMin && rule.endMin >= endMin,
        );
        if (!open) throw new AppException('availability_changed', { reason: 'closed' });
        if (opts.durationMin < r.minReservationMin) {
          throw new AppException('policy_violation', { reason: 'below_min_duration' });
        }
      }
      if (r.exceptions.some((e) => e.startsAt < end && start < e.endsAt)) {
        throw new AppException('availability_changed', { reason: 'exception' });
      }
    }

    return {
      clubId: club.id,
      timezone: tz,
      currency: club.currency,
      slotIntervalMin: club.slotIntervalMin,
      start,
      end,
      weekday,
      startMin,
      endMin,
      resourceIds: opts.resourceIds,
    };
  }

  private priceFor(rules: PriceRuleLike[], slot: ResolvedSlot): number {
    try {
      return resolvePrice(rules, {
        weekday: slot.weekday,
        slotStartMin: slot.startMin,
        slotEndMin: slot.endMin,
        durationMin: slot.endMin - slot.startMin,
        date: slot.start,
        resourceId: slot.resourceIds.length === 1 ? slot.resourceIds[0] : undefined,
      }).priceCents;
    } catch {
      throw new AppException('policy_violation', { reason: 'no_price' });
    }
  }

  private async runBookingTransaction(args: {
    slot: ResolvedSlot;
    userId: number;
    actorUserId: number;
    type: ReservationType;
    source: ReservationSource;
    priceCents: number;
    paymentMethod: PaymentMethod;
    participants: unknown;
    holdExpiresAt: Date | null;
    finalStatus: 'CONFIRMED' | 'PENDING_PAYMENT';
  }) {
    const { slot } = args;
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM "Resource" WHERE id IN (${Prisma.join(slot.resourceIds)}) AND "clubId" = ${slot.clubId} FOR UPDATE`,
        );
        const conflicts = await tx.$queryRaw<Array<{ one: number }>>(
          Prisma.sql`SELECT 1 as one FROM "ReservationResource"
                     WHERE "isActive" AND "resourceId" IN (${Prisma.join(slot.resourceIds)})
                       AND period && tstzrange(${slot.start}, ${slot.end}, '[)') LIMIT 1`,
        );
        if (conflicts.length > 0) throw new AppException('availability_changed', { reason: 'overlap' });

        const reservation = await tx.reservation.create({
          data: {
            clubId: slot.clubId,
            userId: args.userId,
            type: args.type,
            status: 'HOLD',
            source: args.source,
            startsAt: slot.start,
            endsAt: slot.end,
            priceCents: args.priceCents,
            currency: slot.currency,
            paymentMethod: args.paymentMethod,
            holdExpiresAt: args.holdExpiresAt,
            participants: (args.participants ?? undefined) as Prisma.InputJsonValue | undefined,
          },
        });
        for (const resourceId of slot.resourceIds) {
          await tx.$executeRaw(
            Prisma.sql`INSERT INTO "ReservationResource" ("reservationId", "resourceId", period, "isActive")
                       VALUES (${reservation.id}, ${resourceId}, tstzrange(${slot.start}, ${slot.end}, '[)'), true)`,
          );
        }
        const updated = await tx.reservation.update({
          where: { id: reservation.id },
          data: {
            status: args.finalStatus,
            holdExpiresAt: args.finalStatus === 'PENDING_PAYMENT' ? args.holdExpiresAt : null,
          },
        });
        await this.audit(tx, args.actorUserId, `reservation.${args.finalStatus.toLowerCase()}`, reservation.id, {
          status: args.finalStatus,
          priceCents: args.priceCents,
          source: args.source,
        });
        return updated;
      });
    } catch (e) {
      if (isExclusionViolation(e)) throw new AppException('availability_changed', { reason: 'overlap' });
      throw e;
    }
  }

  private async resolveCustomer(clubId: number, input: ManualBookingInput): Promise<number> {
    if (input.customerUserId) {
      const u = await this.prisma.user.findUnique({ where: { id: input.customerUserId } });
      if (!u) throw new AppException('not_found', { reason: 'customer' });
      return u.id;
    }
    const c = input.customer!;
    if (c.email) {
      const existing = await this.prisma.user.findUnique({ where: { email: c.email.toLowerCase() } });
      if (existing) return existing.id;
      const created = await this.prisma.user.create({
        data: {
          email: c.email.toLowerCase(),
          name: c.name,
          phone: c.phone,
          roles: { create: [{ role: 'PLAYER' }] },
        },
      });
      return created.id;
    }
    // Walk-in with no email — synthesize a unique placeholder identity.
    const created = await this.prisma.user.create({
      data: {
        email: `walkin-${clubId}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@walkin.playslot.local`,
        name: c.name,
        phone: c.phone,
        roles: { create: [{ role: 'PLAYER' }] },
      },
    });
    return created.id;
  }

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

  private audit(
    db: Pick<PrismaService, 'auditLog'> | Prisma.TransactionClient,
    actorUserId: number,
    action: string,
    objectId: number,
    after: Record<string, unknown>,
  ) {
    return db.auditLog.create({
      data: {
        actorUserId,
        action,
        objectType: 'Reservation',
        objectId,
        after: after as Prisma.InputJsonValue,
      },
    });
  }
}

/** Postgres exclusion_violation (23P01) surfaced through Prisma raw queries. */
function isExclusionViolation(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    const meta = e.meta as { code?: string; message?: string } | undefined;
    if (meta?.code === '23P01') return true;
    if (typeof meta?.message === 'string' && meta.message.includes('no_resource_overlap')) return true;
  }
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes('no_resource_overlap') || msg.includes('23P01');
}
