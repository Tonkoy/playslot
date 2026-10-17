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
  computeRefund,
  formatInZone,
  hoursUntil,
  instantFromDayMinutes,
  type PriceRuleLike,
  type RefundTier,
  requiresOnlinePayment,
  resolvePrice,
  weekdayInZone,
} from '@playslot/domain';
import { assertInGoodStanding } from '../common/standing';
import { AppException } from '../common/app-exception';
import { normalizeLocale } from '../common/i18n';
import { TurnstileService } from '../common/turnstile.service';
import { SERVER_ENV } from '../config/app-config.module';
import { EventsService } from '../events/events.service';
import { MailService } from '../mail/mail.service';
import { applyDiscount, MembershipsService } from '../memberships/memberships.service';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { HoldQueueService } from './hold-queue.service';

interface Actor {
  userId: number;
  emailVerified: boolean;
}

interface ResolvedSlot {
  clubId: number;
  /** The club asks to confirm player bookings before they count (spec §16). */
  requiresBookingApproval: boolean;
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
    private readonly events: EventsService,
    private readonly mail: MailService,
    private readonly turnstile: TurnstileService,
    @Inject(forwardRef(() => PaymentsService))
    private readonly payments: PaymentsService,
    private readonly memberships: MembershipsService,
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
    if (source === 'WEB') await assertInGoodStanding(this.prisma, actor.userId);
    if (source === 'WEB' && !(await this.turnstile.verify(input.turnstileToken))) {
      throw new AppException('validation_failed', { fields: { turnstile: ['failed'] } });
    }

    const slot = await this.resolveSlot({
      clubId: input.clubId,
      startsAt: input.startsAt,
      durationMin: input.durationMin,
      resourceIds: input.resourceIds,
      enforceHours: true,
    });

    // Coaching (spec §7/§10): a lesson reserves the court AND the coach in ONE
    // transaction. The coach is a single shared resource, so the §8 constraint
    // also prevents cross-club double-booking.
    let priceCents: number;
    let type = input.type;
    if (input.coachProfileId) {
      type = 'LESSON';
      const coachResourceId = await this.resolveCoachResource(input.coachProfileId, slot);
      slot.resourceIds = [...slot.resourceIds, coachResourceId];
      priceCents = await this.lessonPrice(input.coachProfileId, input.serviceId, slot);
    } else {
      priceCents = this.priceFor(await this.loadPriceRules(slot.clubId), slot);
    }
    // Member pricing (spec §9): discount the recomputed server price.
    priceCents = applyDiscount(
      priceCents,
      await this.memberships.discountPercent(slot.clubId, actor.userId),
    );

    const online = requiresOnlinePayment(input.paymentMethod);
    const holdExpiresAt = new Date(Date.now() + this.env.HOLD_TTL_MIN * 60_000);
    // Paying online settles it there and then; otherwise the club may want the
    // last word, and the slot stays held until staff confirm (spec §16).
    const needsApproval = !online && slot.requiresBookingApproval;

    const reservation = await this.runBookingTransaction({
      slot,
      userId: actor.userId,
      actorUserId: actor.userId,
      type,
      source,
      priceCents,
      paymentMethod: input.paymentMethod,
      participants: input.participants ?? null,
      holdExpiresAt,
      finalStatus: online ? 'PENDING_PAYMENT' : needsApproval ? 'PENDING_APPROVAL' : 'CONFIRMED',
    });

    this.events.emitAvailabilityChanged(slot.clubId);

    let checkoutUrl: string | undefined;
    if (online) {
      await this.holds.scheduleExpiry(reservation.id, holdExpiresAt);
      const u = await this.prisma.user.findUnique({
        where: { id: actor.userId },
        select: { email: true, locale: true },
      });
      const { url } = await this.payments.createCheckout({
        reservationId: reservation.id,
        amountCents: priceCents,
        currency: slot.currency,
        description: `PlaySlot booking #${reservation.id}`,
        customerEmail: u?.email,
        locale: normalizeLocale(u?.locale),
      });
      checkoutUrl = url;
    } else if (needsApproval) {
      await this.sendBookingReceivedEmail(reservation.id);
    } else {
      await this.sendConfirmationEmail(reservation.id);
    }

    return {
      reservationId: reservation.id,
      status: reservation.status,
      holdExpiresAt: reservation.holdExpiresAt ? reservation.holdExpiresAt.toISOString() : null,
      priceCents,
      currency: slot.currency,
      next: online ? { action: 'PAY', checkoutUrl } : { action: 'CONFIRMED' },
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

    // A lesson booked by staff reserves the coach alongside the court, exactly
    // as the public path does — same single shared COACH resource, so §8 still
    // prevents booking the coach twice.
    let type = input.type;
    let priceCents: number;
    if (input.coachProfileId) {
      type = 'LESSON';
      const coachResourceId = await this.resolveCoachResource(input.coachProfileId, slot);
      slot.resourceIds = [...slot.resourceIds, coachResourceId];
      priceCents = await this.lessonPrice(input.coachProfileId, input.serviceId, slot);
    } else {
      priceCents = this.priceFor(await this.loadPriceRules(clubId), slot);
    }

    const reservation = await this.runBookingTransaction({
      slot,
      userId: customerUserId,
      actorUserId: staffUserId,
      type,
      source: 'CLUB_STAFF',
      priceCents,
      paymentMethod: input.paymentMethod,
      participants: input.customer ? { name: input.customer.name } : null,
      holdExpiresAt: null,
      finalStatus: input.status,
    });
    this.events.emitAvailabilityChanged(slot.clubId);
    // Confirmed: tell the customer it is booked. Awaiting the club's word:
    // tell them it is held, the same two-step flow the public booking uses.
    if (reservation.status === 'PENDING_APPROVAL') await this.sendBookingReceivedEmail(reservation.id);
    else await this.sendConfirmationEmail(reservation.id);
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
    this.events.emitAvailabilityChanged(slot.clubId);
    return { reservationId: reservation.id, status: reservation.status };
  }

  // ── coach-hosted group session: reserve coach + court (spec §10) ──
  async createCoachBlockingReservation(args: {
    coachProfileId: number;
    coachUserId: number;
    clubId: number;
    startsAt: string;
    durationMin: number;
    courtId: number;
    title: string;
  }): Promise<{ reservationId: number; start: Date; end: Date; currency: string }> {
    const slot = await this.resolveSlot({
      clubId: args.clubId,
      startsAt: args.startsAt,
      durationMin: args.durationMin,
      resourceIds: [args.courtId],
      enforceHours: true,
    });
    const coachResourceId = await this.resolveCoachResource(args.coachProfileId, slot);
    const full: ResolvedSlot = { ...slot, resourceIds: [args.courtId, coachResourceId] };
    const reservation = await this.runBookingTransaction({
      slot: full,
      userId: args.coachUserId,
      actorUserId: args.coachUserId,
      type: 'LESSON',
      source: 'COACH',
      priceCents: 0,
      paymentMethod: 'FREE',
      participants: { group: true, name: args.title },
      holdExpiresAt: null,
      finalStatus: 'CONFIRMED',
    });
    this.events.emitAvailabilityChanged(full.clubId);
    return { reservationId: reservation.id, start: full.start, end: full.end, currency: full.currency };
  }

  /** Cancel a reservation's hold on inventory (used when a group session is cancelled). */
  async releaseReservation(reservationId: number, reason: string): Promise<void> {
    const r = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      select: { clubId: true, status: true },
    });
    if (!r || r.status === 'CANCELLED') return;
    await this.prisma.reservation.update({
      where: { id: reservationId },
      data: { status: 'CANCELLED', cancellationReason: reason },
    });
    this.events.emitAvailabilityChanged(r.clubId);
  }

  // ── move / reschedule / change court (re-runs conflict logic) ──
  async reschedule(clubId: number, reservationId: number, input: RescheduleInput, staffUserId: number) {
    const existing = await this.prisma.reservation.findFirst({ where: { id: reservationId, clubId } });
    if (!existing) throw new AppException('not_found');
    if (!['HOLD', 'PENDING_PAYMENT', 'PENDING_APPROVAL', 'CONFIRMED'].includes(existing.status)) {
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

        const active = ['HOLD', 'PENDING_PAYMENT', 'PENDING_APPROVAL', 'CONFIRMED', 'COMPLETED'].includes(
          existing.status,
        );
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
      this.events.emitAvailabilityChanged(clubId);
      // Notify the parties the booking moved (not for maintenance BLOCKs).
      if (existing.type !== 'BLOCK') {
        const previousWhen = formatInZone(existing.startsAt, slot.timezone, 'yyyy-MM-dd HH:mm');
        await this.sendRescheduleEmails(reservationId, previousWhen);
      }
      return { id: updated.id, startsAt: updated.startsAt.toISOString(), priceCents };
    } catch (e) {
      if (isExclusionViolation(e)) throw new AppException('availability_changed', { reason: 'overlap' });
      throw e;
    }
  }

  /**
   * Club staff approve a booking that was waiting for them: the second half of
   * the two-step flow. Idempotent — confirming an already-confirmed booking is
   * a no-op rather than an error, so a double click costs nothing.
   */
  async confirm(clubId: number, reservationId: number, staffUserId: number) {
    const r = await this.prisma.reservation.findFirst({ where: { id: reservationId, clubId } });
    if (!r) throw new AppException('not_found');
    if (r.status === 'CONFIRMED') return { id: r.id, status: r.status };
    if (r.status !== 'PENDING_APPROVAL') {
      throw new AppException('policy_violation', { reason: 'not_awaiting_approval' });
    }

    await this.prisma.reservation.update({
      where: { id: reservationId },
      data: { status: 'CONFIRMED', holdExpiresAt: null },
    });
    await this.audit(this.prisma, staffUserId, 'reservation.confirmed', reservationId, {
      from: r.status,
    });
    this.events.emitAvailabilityChanged(clubId);
    await this.sendConfirmationEmail(reservationId);
    return { id: reservationId, status: 'CONFIRMED' as const };
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
    await this.sendReceiptEmail(reservationId);
    return { id: reservationId, paymentStatus: 'CAPTURED' as const };
  }

  async markNoShow(clubId: number, reservationId: number, staffUserId: number) {
    const r = await this.prisma.reservation.findFirst({ where: { id: reservationId, clubId } });
    if (!r) throw new AppException('not_found');
    if (r.status !== 'CONFIRMED') throw new AppException('policy_violation', { reason: 'not_confirmed' });
    if (r.startsAt > new Date()) throw new AppException('policy_violation', { reason: 'not_started' });
    await this.prisma.reservation.update({ where: { id: reservationId }, data: { status: 'NO_SHOW' } });
    await this.audit(this.prisma, staffUserId, 'reservation.no_show', reservationId, {});
    this.events.emitAvailabilityChanged(clubId);
    await this.sendNoShowEmail(reservationId);
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

    const [courts, reservations, closures] = await Promise.all([
      this.prisma.resource.findMany({
        where: { clubId, type: 'COURT' },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.reservation.findMany({
        where: {
          clubId,
          status: { in: ['HOLD', 'PENDING_PAYMENT', 'PENDING_APPROVAL', 'CONFIRMED', 'COMPLETED', 'NO_SHOW'] },
          startsAt: { lt: dayEnd },
          endsAt: { gt: dayStart },
        },
        include: {
          resources: {
            select: {
              resourceId: true,
              resource: {
                select: { type: true, coachProfile: { select: { user: { select: { name: true } } } } },
              },
            },
          },
          user: { select: { name: true } },
          payment: { select: { status: true } },
          groupSession: { select: { title: true, capacity: true, _count: { select: { registrations: true } } } },
        },
      }),
      // Closures are resource exceptions, not reservations — without these the
      // calendar showed a closed day as free (QA-03).
      this.prisma.resourceException.findMany({
        where: {
          resource: { clubId, type: 'COURT' },
          startsAt: { lt: dayEnd },
          endsAt: { gt: dayStart },
        },
        select: { resourceId: true, startsAt: true, endsAt: true, reason: true },
        orderBy: { startsAt: 'asc' },
      }),
    ]);

    // Identical windows across courts collapse into one row with its courts.
    const closureByWindow = new Map<string, { startsAt: Date; endsAt: Date; reason: string; resourceIds: number[] }>();
    for (const c of closures) {
      const key = `${c.startsAt.toISOString()}|${c.endsAt.toISOString()}|${c.reason}`;
      const cur = closureByWindow.get(key);
      if (cur) cur.resourceIds.push(c.resourceId);
      else closureByWindow.set(key, { startsAt: c.startsAt, endsAt: c.endsAt, reason: c.reason, resourceIds: [c.resourceId] });
    }

    return {
      date: isoDate,
      timezone: tz,
      slotIntervalMin: club.slotIntervalMin,
      courts,
      entries: reservations.map((r) => {
        const coachName =
          r.resources.find((x) => x.resource.type === 'COACH')?.resource.coachProfile?.user.name ?? null;
        const participants = r.participants as { reason?: string; name?: string } | null;
        return {
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
          coachName,
          groupSession: r.groupSession
            ? {
                title: r.groupSession.title,
                registered: r.groupSession._count.registrations,
                capacity: r.groupSession.capacity,
              }
            : null,
          blockReason: r.type === 'BLOCK' ? (participants?.reason ?? null) : null,
        };
      }),
      closures: [...closureByWindow.values()].map((c) => ({
        startsAt: formatInZone(c.startsAt, tz),
        endsAt: formatInZone(c.endsAt, tz),
        reason: c.reason,
        resourceIds: c.resourceIds,
      })),
    };
  }

  /** Export a club's reservations in a date range as CSV (opens in Excel). */
  async exportCsv(clubId: number, from: string, to: string): Promise<{ filename: string; csv: string }> {
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRe.test(from) || !dateRe.test(to)) {
      throw new AppException('validation_failed', { fields: { from: ['from/to must be YYYY-MM-DD'] } });
    }
    const club = await this.prisma.club.findFirst({ where: { id: clubId }, select: { timezone: true, slug: true } });
    if (!club) throw new AppException('not_found');
    const tz = club.timezone;
    const start = instantFromDayMinutes(from, 0, tz);
    const end = instantFromDayMinutes(to, 24 * 60, tz);
    if (end <= start) throw new AppException('validation_failed', { fields: { to: ['must not be before from'] } });

    const rows = await this.prisma.reservation.findMany({
      where: { clubId, startsAt: { lt: end }, endsAt: { gt: start } },
      orderBy: { startsAt: 'asc' },
      include: {
        resources: { select: { resource: { select: { name: true } } } },
        user: { select: { name: true } },
        payment: { select: { status: true } },
      },
    });

    const header = ['Date', 'Start', 'End', 'Courts', 'Type', 'Status', 'Customer', 'Price', 'Currency', 'Payment', 'PaymentStatus', 'Source'];
    const lines = [header];
    for (const r of rows) {
      const participantName = (r.participants as { name?: string } | null)?.name;
      lines.push([
        formatInZone(r.startsAt, tz, 'yyyy-MM-dd'),
        formatInZone(r.startsAt, tz, 'HH:mm'),
        formatInZone(r.endsAt, tz, 'HH:mm'),
        r.resources.map((x) => x.resource.name).join(' + '),
        r.type,
        r.status,
        r.type === 'BLOCK' ? '' : (r.user?.name ?? participantName ?? ''),
        (r.priceCents / 100).toFixed(2),
        r.currency,
        r.paymentMethod,
        r.payment?.status ?? '',
        r.source,
      ]);
    }
    // UTF-8 BOM so Excel reads Cyrillic; CRLF line endings; RFC-4180 quoting.
    const csv = '﻿' + lines.map((row) => row.map(csvCell).join(',')).join('\r\n');
    return { filename: `${club.slug}_${from}_${to}.csv`, csv };
  }

  /**
   * Who the club can book a court for (spec §16). With no search term: the
   * club's own customers, most recent first — the short list staff reach for
   * every day. With one (2+ characters): any registered player by name, e-mail
   * or phone, because a club that has just joined has no history yet and still
   * needs to book for the players in front of them.
   */
  async listCustomers(clubId: number, q?: string) {
    const term = (q ?? '').trim();
    const select = { id: true, name: true, email: true, phone: true };

    if (term.length >= 2) {
      return this.prisma.user.findMany({
        where: {
          deletedAt: null,
          OR: [
            { name: { contains: term, mode: 'insensitive' } },
            { email: { contains: term, mode: 'insensitive' } },
            { phone: { contains: term } },
          ],
        },
        select,
        orderBy: { name: 'asc' },
        take: 10,
      });
    }

    const rows = await this.prisma.reservation.findMany({
      where: { clubId, type: { in: ['COURT', 'LESSON'] } },
      distinct: ['userId'],
      select: { user: { select: { id: true, name: true, email: true, phone: true } } },
      orderBy: { startsAt: 'desc' },
      take: 25,
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
    this.events.emitAvailabilityChanged(r.clubId);
  }

  /** Webhook: confirm a paid online reservation (idempotent, spec §17). */
  async confirmPaidReservation(reservationId: number, paymentRef: string): Promise<void> {
    const r = await this.prisma.reservation.findUnique({ where: { id: reservationId } });
    if (!r || r.status !== 'PENDING_PAYMENT') return; // idempotent on replay
    await this.prisma.$transaction([
      this.prisma.reservation.update({
        where: { id: reservationId },
        data: { status: 'CONFIRMED', holdExpiresAt: null },
      }),
      this.prisma.payment.updateMany({
        where: { reservationId },
        data: { status: 'CAPTURED', providerRef: paymentRef, capturedAt: new Date() },
      }),
    ]);
    this.events.emitAvailabilityChanged(r.clubId);
    await this.sendConfirmationEmail(reservationId);
  }

  /** Webhook: a failed/expired online payment releases inventory (no phantom). */
  async failPayment(reservationId: number): Promise<void> {
    const r = await this.prisma.reservation.findUnique({ where: { id: reservationId } });
    if (!r || r.status !== 'PENDING_PAYMENT') return;
    await this.prisma.$transaction([
      this.prisma.reservation.update({
        where: { id: reservationId },
        data: { status: 'CANCELLED', cancellationReason: 'payment_failed' },
      }),
      this.prisma.payment.updateMany({ where: { reservationId }, data: { status: 'FAILED' } }),
    ]);
    this.events.emitAvailabilityChanged(r.clubId);
  }

  /**
   * Cancel a reservation and compute the refund from the club's stored policy
   * (spec §12/§18). Releases inventory (via the isActive trigger), records the
   * refund intent on the payment, emits a live update, and emails the customer.
   * Actual PSP settlement of the refund is Phase 7.
   */
  async cancel(reservationId: number, userId: number, roles: string[], reason?: string) {
    const r = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        payment: true,
        user: { select: { email: true, name: true, locale: true } },
        club: { select: { name: true, timezone: true } },
      },
    });
    if (!r) throw new AppException('not_found');
    const isOwner = r.userId === userId;
    const isStaff = await this.isClubStaff(r.clubId, userId, roles);
    if (!isOwner && !isStaff) throw new AppException('forbidden');
    if (!['HOLD', 'PENDING_PAYMENT', 'PENDING_APPROVAL', 'CONFIRMED'].includes(r.status)) {
      throw new AppException('policy_violation', { reason: 'not_cancellable' });
    }

    // Refund per the matching cancellation policy tier.
    let refundCents = 0;
    if (r.type === 'COURT' || r.type === 'LESSON') {
      const policy = await this.prisma.cancellationPolicy.findFirst({
        where: { clubId: r.clubId, appliesTo: r.type },
      });
      const tiers = (policy?.tiers as RefundTier[] | undefined) ?? [];
      refundCents = computeRefund(tiers, hoursUntil(r.startsAt), r.priceCents).refundCents;
    }

    const willRefund = refundCents > 0 && r.payment?.status === 'CAPTURED';
    await this.prisma.$transaction(async (tx) => {
      await tx.reservation.update({
        where: { id: reservationId },
        data: { status: 'CANCELLED', cancellationReason: reason ?? 'user_cancelled' },
      });
      if (willRefund && r.payment) {
        await tx.payment.update({
          where: { reservationId },
          data: {
            status: refundCents >= r.payment.amountCents ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
            refundedAt: new Date(),
          },
        });
      }
      await this.audit(tx, userId, 'reservation.cancelled', reservationId, {
        refundCents,
        reason: reason ?? 'user_cancelled',
      });
    });

    // Issue the actual PSP refund against the captured payment (spec §18).
    if (willRefund && r.payment?.providerRef) {
      try {
        await this.payments.refund(r.payment.providerRef, refundCents);
      } catch {
        // Settlement failed; the refund intent is recorded — reconcile via runbook.
      }
    }

    const refundStatus: 'NONE' | 'PENDING' = willRefund ? 'PENDING' : 'NONE';
    this.events.emitAvailabilityChanged(r.clubId);

    // Notify all parties (customer with refund; club staff + any coach). Best-effort.
    await this.sendCancellationEmails(reservationId, refundCents);

    return { status: 'CANCELLED' as const, refundCents, refundStatus };
  }

  /**
   * On a confirmed booking, notify all three parties (spec §19), each in their
   * own locale and all best-effort so a mail failure never rolls back the
   * booking:
   *   1. the customer — booking confirmation;
   *   2. the club's admins/staff — a heads-up that a slot filled;
   *   3. for a LESSON, the selected coach — a new-lesson notice.
   */
  /**
   * Booking made, club's turn: the player hears that the slot is held, and the
   * club hears that something is waiting for them.
   */
  private async sendBookingReceivedEmail(reservationId: number): Promise<void> {
    const p = await this.loadReservationParties(reservationId);
    if (!p) return;
    if (p.customer) {
      await this.mail
        .sendBookingReceived(
          p.customer.email,
          {
            clubName: p.clubName,
            when: p.when,
            priceCents: p.priceCents,
            currency: p.currency,
            what: p.what,
            bookingRef: reservationId,
          },
          normalizeLocale(p.customer.locale),
        )
        .catch(() => undefined);
    }
    for (const s of p.staff) {
      await this.mail
        .sendStaffBookingNotice(
          s.email,
          {
            clubName: p.clubName,
            when: p.when,
            customerName: p.customerName,
            what: p.what,
            priceCents: p.priceCents,
            currency: p.currency,
          },
          normalizeLocale(s.locale),
        )
        .catch(() => undefined);
    }
    await this.notifyPlatform(reservationId, true);
  }

  /**
   * Copy every new booking to the platform inbox (PLATFORM_NOTIFY_EMAIL), so
   * someone outside the club sees the traffic. Best-effort: a failure here
   * must never affect the booking or the customer's own email.
   */
  private async notifyPlatform(reservationId: number, awaitingApproval: boolean): Promise<void> {
    const to = this.env.PLATFORM_NOTIFY_EMAIL;
    if (!to) return;
    const p = await this.loadReservationParties(reservationId);
    if (!p) return;
    // Don't send twice when the platform inbox is also a club member.
    if (p.staff.some((s) => s.email.toLowerCase() === to.toLowerCase())) return;

    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      select: { type: true },
    });
    await this.mail
      .sendPlatformBookingNotice(to, {
        clubName: p.clubName,
        when: p.when,
        priceCents: p.priceCents,
        currency: p.currency,
        what: p.what,
        coachName: p.coachUser?.name ?? null,
        bookingRef: reservationId,
        customerName: p.customerName,
        customerEmail: p.customer?.email ?? null,
        awaitingApproval,
        reservationType: reservation?.type ?? 'COURT',
      })
      .catch(() => undefined);
  }

  private async sendConfirmationEmail(reservationId: number): Promise<void> {
    const p = await this.loadReservationParties(reservationId);
    if (!p) return;
    // 1. customer (skip synthetic walk-in addresses)
    if (p.customer) {
      await this.mail
        .sendConfirmation(
          p.customer.email,
          {
            clubName: p.clubName,
            when: p.when,
            priceCents: p.priceCents,
            currency: p.currency,
            what: p.what,
            bookingRef: reservationId,
          },
          normalizeLocale(p.customer.locale),
        )
        .catch(() => undefined);
    }
    // 2. club admins/staff
    for (const s of p.staff) {
      await this.mail
        .sendStaffBookingNotice(
          s.email,
          { clubName: p.clubName, when: p.when, customerName: p.customerName, what: p.what, priceCents: p.priceCents, currency: p.currency },
          normalizeLocale(s.locale),
        )
        .catch(() => undefined);
    }
    // 3. the coach on a lesson
    if (p.coachUser) {
      await this.mail
        .sendCoachBookingNotice(
          p.coachUser.email,
          { clubName: p.clubName, when: p.when, customerName: p.customerName },
          normalizeLocale(p.coachUser.locale),
        )
        .catch(() => undefined);
    }
    // 4. the platform inbox
    await this.notifyPlatform(reservationId, false);
  }

  /**
   * On a cancellation, notify the same three parties (spec §19), best-effort:
   *   1. the customer — cancellation + any refund;
   *   2. the club's admins/staff — the slot reopened;
   *   3. for a LESSON, the selected coach — the lesson is off.
   */
  private async sendCancellationEmails(reservationId: number, refundCents: number): Promise<void> {
    const p = await this.loadReservationParties(reservationId);
    if (!p) return;
    // 1. customer (skip synthetic walk-in addresses)
    if (p.customer) {
      await this.mail
        .sendCancellation(
          p.customer.email,
          {
            clubName: p.clubName,
            when: p.when,
            refundCents,
            currency: p.currency,
            priceCents: p.priceCents,
            what: p.what,
            bookingRef: reservationId,
          },
          normalizeLocale(p.customer.locale),
        )
        .catch(() => undefined);
    }
    // 2. club admins/staff
    for (const s of p.staff) {
      await this.mail
        .sendStaffCancellationNotice(
          s.email,
          { clubName: p.clubName, when: p.when, customerName: p.customerName, what: p.what },
          normalizeLocale(s.locale),
        )
        .catch(() => undefined);
    }
    // 3. the coach on a lesson
    if (p.coachUser) {
      await this.mail
        .sendCoachCancellationNotice(
          p.coachUser.email,
          { clubName: p.clubName, when: p.when, customerName: p.customerName },
          normalizeLocale(p.coachUser.locale),
        )
        .catch(() => undefined);
    }
  }

  /**
   * On a reschedule/move, notify the customer, admins/staff, and (for a LESSON)
   * the coach that the booking shifted. Best-effort; skipped for BLOCKs.
   */
  private async sendRescheduleEmails(reservationId: number, previousWhen?: string): Promise<void> {
    const p = await this.loadReservationParties(reservationId);
    if (!p) return;
    if (p.customer) {
      await this.mail
        .sendReschedule(
          p.customer.email,
          { clubName: p.clubName, when: p.when, previousWhen },
          normalizeLocale(p.customer.locale),
        )
        .catch(() => undefined);
    }
    for (const s of p.staff) {
      await this.mail
        .sendStaffRescheduleNotice(
          s.email,
          { clubName: p.clubName, when: p.when, previousWhen, customerName: p.customerName, what: p.what },
          normalizeLocale(s.locale),
        )
        .catch(() => undefined);
    }
    if (p.coachUser) {
      await this.mail
        .sendCoachRescheduleNotice(
          p.coachUser.email,
          { clubName: p.clubName, when: p.when, previousWhen, customerName: p.customerName },
          normalizeLocale(p.coachUser.locale),
        )
        .catch(() => undefined);
    }
  }

  /** Receipt to the customer once a booking is marked paid (best-effort). */
  private async sendReceiptEmail(reservationId: number): Promise<void> {
    const p = await this.loadReservationParties(reservationId);
    if (!p?.customer) return;
    await this.mail
      .sendPaymentReceipt(
        p.customer.email,
        { clubName: p.clubName, when: p.when, priceCents: p.priceCents, currency: p.currency },
        normalizeLocale(p.customer.locale),
      )
      .catch(() => undefined);
  }

  /** Notice to the customer that they were marked a no-show (best-effort). */
  private async sendNoShowEmail(reservationId: number): Promise<void> {
    const p = await this.loadReservationParties(reservationId);
    if (!p?.customer) return;
    await this.mail
      .sendNoShowNotice(
        p.customer.email,
        { clubName: p.clubName, when: p.when },
        normalizeLocale(p.customer.locale),
      )
      .catch(() => undefined);
  }

  /**
   * Shared recipient resolution for booking notifications (spec §19): loads the
   * reservation with its club staff and coach, and derives the display fields.
   * Returns null if the reservation is gone. `customer` is null for synthetic
   * walk-in bookings; `staff` is deduped and excludes the booking customer.
   */
  private async loadReservationParties(reservationId: number) {
    const r = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        user: { select: { email: true, locale: true, name: true, notifyByEmail: true } },
        club: {
          select: {
            name: true,
            timezone: true,
            members: {
              where: { status: 'ACTIVE', role: { in: ['CLUB_ADMIN', 'CLUB_STAFF'] } },
              select: { user: { select: { email: true, locale: true } } },
            },
          },
        },
        resources: {
          select: {
            resource: {
              select: {
                type: true,
                name: true,
                coachProfile: { select: { user: { select: { email: true, locale: true, name: true } } } },
              },
            },
          },
        },
      },
    });
    if (!r) return null;

    const when = formatInZone(r.startsAt, r.club.timezone, 'yyyy-MM-dd HH:mm');
    const walkin = r.user?.email.endsWith('@walkin.playslot.local') ?? true;
    const participantName = (r.participants as { name?: string } | null)?.name;
    const customerName =
      (!walkin ? r.user?.name : undefined) ?? participantName ?? 'PlaySlot customer';
    const what = r.resources.map((x) => x.resource.name).join(' + ') || r.type;
    const customerEmail = r.user?.email;
    const coachUser =
      r.resources
        .map((x) => x.resource)
        .find((res) => res.type === 'COACH' && res.coachProfile?.user)?.coachProfile?.user ?? null;

    // Deduped club admins/staff, excluding the booking customer.
    const staffByEmail = new Map<string, { email: string; locale: string }>();
    for (const m of r.club.members) {
      if (m.user.email === customerEmail) continue;
      staffByEmail.set(m.user.email, m.user);
    }

    return {
      clubName: r.club.name,
      when,
      // Skip the customer's own transactional email when they've turned notifications off.
      customer: !walkin && r.user?.notifyByEmail ? r.user : null,
      customerName,
      what,
      priceCents: r.priceCents,
      currency: r.currency,
      staff: [...staffByEmail.values()],
      coachUser,
    };
  }

  async listMine(userId: number): Promise<ReservationSummary[]> {
    const rows = await this.prisma.reservation.findMany({
      where: { userId },
      orderBy: { startsAt: 'desc' },
      include: { resources: { select: { resourceId: true } }, club: { select: { name: true, photoUrl: true } } },
      take: 100,
    });
    return rows.map((r) => this.toSummary(r));
  }

  async getOne(id: number, userId: number, roles: string[]): Promise<ReservationSummary> {
    const r = await this.prisma.reservation.findUnique({
      where: { id },
      include: { resources: { select: { resourceId: true } }, club: { select: { name: true, photoUrl: true } } },
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
      select: {
        id: true,
        timezone: true,
        slotIntervalMin: true,
        currency: true,
        requiresBookingApproval: true,
      },
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
      // Club closure / court downtime — refused for players, staff walk-ins and
      // blocks alike, so a closed day cannot be booked from any side (QA-04).
      if (r.exceptions.some((e) => e.startsAt < end && start < e.endsAt)) {
        throw new AppException('availability_changed', { reason: 'club_closed' });
      }
    }

    return {
      clubId: club.id,
      requiresBookingApproval: club.requiresBookingApproval,
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

  /** Resolve + validate the coach's single shared resource for a lesson slot. */
  private async resolveCoachResource(coachProfileId: number, slot: ResolvedSlot): Promise<number> {
    const link = await this.prisma.coachClub.findFirst({
      where: { coachProfileId, clubId: slot.clubId },
    });
    if (!link) throw new AppException('not_found', { reason: 'coach_not_at_club' });

    const coach = await this.prisma.resource.findFirst({
      where: { coachProfileId, type: 'COACH', status: 'ACTIVE' },
      include: { availabilityRules: true },
    });
    if (!coach) throw new AppException('not_found', { reason: 'coach_resource' });

    const available = coach.availabilityRules.some(
      (r) => r.weekday === slot.weekday && r.startMin <= slot.startMin && r.endMin >= slot.endMin,
    );
    if (!available) throw new AppException('availability_changed', { reason: 'coach_closed' });
    return coach.id;
  }

  private async lessonPrice(
    coachProfileId: number,
    serviceId: number | undefined,
    slot: ResolvedSlot,
  ): Promise<number> {
    if (serviceId) {
      const service = await this.prisma.coachService.findFirst({
        where: { id: serviceId, coachProfileId },
      });
      if (!service) throw new AppException('not_found', { reason: 'service' });
      return service.priceCents;
    }
    return this.priceFor(await this.loadPriceRules(slot.clubId), slot);
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
    finalStatus: 'CONFIRMED' | 'PENDING_PAYMENT' | 'PENDING_APPROVAL';
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
    club?: { name: string; photoUrl?: string | null };
  }): ReservationSummary {
    return {
      id: r.id,
      clubId: r.clubId,
      clubName: r.club?.name,
      clubPhotoUrl: r.club?.photoUrl ?? null,
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

/** RFC-4180 CSV field: quote when it contains a comma, quote or newline. */
function csvCell(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
