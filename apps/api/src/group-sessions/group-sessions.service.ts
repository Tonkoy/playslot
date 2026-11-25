import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ServerEnv } from '@playslot/config';
import {
  type CreateGroupSessionInput,
  type GroupSessionDto,
  type UpdateGroupSessionInput,
} from '@playslot/contracts';
import { formatInZone } from '@playslot/domain';
import { normalizeLocale } from '../common/i18n';
import { assertInGoodStanding } from '../common/standing';
import { AppException } from '../common/app-exception';
import { SERVER_ENV } from '../config/app-config.module';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReservationsService } from '../reservations/reservations.service';

const INVITE_CAP = 1000; // safety cap on invitation fan-out

/**
 * Coach-hosted group sessions (spec §10/§22): creation reserves the coach + a
 * court via the booking engine (no double-booking), invites subscribed players
 * by email, and players register up to capacity.
 */
@Injectable()
export class GroupSessionsService {
  private readonly logger = new Logger('GroupSessions');

  constructor(
    private readonly prisma: PrismaService,
    private readonly reservations: ReservationsService,
    private readonly mail: MailService,
    @Inject(SERVER_ENV) private readonly env: ServerEnv,
  ) {}

  async create(coachUserId: number, input: CreateGroupSessionInput): Promise<GroupSessionDto> {
    const profile = await this.prisma.coachProfile.findFirst({
      where: { userId: coachUserId },
      select: { id: true },
    });
    if (!profile) throw new AppException('forbidden', { reason: 'not_a_coach' });

    // Reserve coach + court (validates coach availability, court hours, conflicts).
    const res = await this.reservations.createCoachBlockingReservation({
      coachProfileId: profile.id,
      coachUserId,
      clubId: input.clubId,
      startsAt: input.startsAt,
      durationMin: input.durationMin,
      courtId: input.courtId,
      title: input.title,
    });

    const session = await this.prisma.groupSession.create({
      data: {
        coachProfileId: profile.id,
        clubId: input.clubId,
        reservationId: res.reservationId,
        title: input.title,
        description: input.description ?? null,
        level: input.level ?? null,
        startsAt: res.start,
        endsAt: res.end,
        capacity: input.capacity,
        priceCents: input.priceCents,
        currency: res.currency,
      },
    });

    // Invite subscribed players (best-effort; never blocks creation).
    void this.invitePlayers(session.id).catch((e) =>
      this.logger.warn(`Invite fan-out failed for session ${session.id}: ${String(e)}`),
    );

    return this.getOne(session.id, coachUserId);
  }

  /**
   * The coach changes their session: its words, size, price, level — and, with
   * `slot`, its day and hour. A move goes through the booking engine, so the
   * coach and the new court must both be free; everyone signed up is told.
   */
  async update(id: number, coachUserId: number, input: UpdateGroupSessionInput): Promise<GroupSessionDto> {
    const session = await this.prisma.groupSession.findUnique({
      where: { id },
      include: {
        coach: { select: { userId: true } },
        club: { select: { name: true, timezone: true } },
        _count: { select: { registrations: true } },
        registrations: { select: { user: { select: { email: true, locale: true } } } },
      },
    });
    if (!session) throw new AppException('not_found');
    if (session.coach.userId !== coachUserId) throw new AppException('forbidden');
    if (session.cancelledAt || session.endsAt <= new Date()) {
      throw new AppException('policy_violation', { reason: 'ended' });
    }
    if (input.capacity != null && input.capacity < session._count.registrations) {
      throw new AppException('policy_violation', { reason: 'below_registered' });
    }

    let times: { startsAt: Date; endsAt: Date } | null = null;
    if (input.slot) {
      const moved = await this.reservations.reschedule(
        session.clubId,
        session.reservationId,
        { startsAt: input.slot.startsAt, durationMin: input.slot.durationMin, resourceIds: [input.slot.courtId] },
        coachUserId,
        // Those who signed up hear it from here, in words about a training.
        { notify: false },
      );
      const startsAt = new Date(moved.startsAt);
      times = { startsAt, endsAt: new Date(startsAt.getTime() + input.slot.durationMin * 60_000) };
    }

    await this.prisma.groupSession.update({
      where: { id },
      data: {
        ...(input.title != null ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
        ...(input.level !== undefined ? { level: input.level } : {}),
        ...(input.capacity != null ? { capacity: input.capacity } : {}),
        ...(input.priceCents != null ? { priceCents: input.priceCents } : {}),
        ...(times ?? {}),
      },
    });

    if (times && times.startsAt.getTime() !== session.startsAt.getTime()) {
      const tz = session.club.timezone;
      const info = {
        title: input.title ?? session.title,
        clubName: session.club.name,
        when: formatInZone(times.startsAt, tz, 'yyyy-MM-dd HH:mm'),
        previousWhen: formatInZone(session.startsAt, tz, 'yyyy-MM-dd HH:mm'),
      };
      // In the background: the change is saved, the emails are a courtesy.
      void Promise.all(
        session.registrations.map((reg) =>
          this.mail.sendGroupSessionMoved(reg.user.email, info, normalizeLocale(reg.user.locale)).catch(() => undefined),
        ),
      );
    }
    return this.getOne(id, coachUserId);
  }

  async list(clubId: number | undefined, userId?: number): Promise<GroupSessionDto[]> {
    const rows = await this.prisma.groupSession.findMany({
      where: { cancelledAt: null, endsAt: { gt: new Date() }, ...(clubId ? { clubId } : {}) },
      orderBy: { startsAt: 'asc' },
      take: 100,
      ...this.dtoInclude(userId),
    });
    return rows.map((r) => this.toDto(r, userId));
  }

  /** A coach's own sessions (upcoming + recent), including cancelled, for management. */
  async listMine(coachUserId: number): Promise<GroupSessionDto[]> {
    const profile = await this.prisma.coachProfile.findFirst({ where: { userId: coachUserId }, select: { id: true } });
    if (!profile) throw new AppException('forbidden', { reason: 'not_a_coach' });
    const rows = await this.prisma.groupSession.findMany({
      where: { coachProfileId: profile.id, endsAt: { gt: new Date(Date.now() - 7 * 86_400_000) } },
      orderBy: { startsAt: 'asc' },
      take: 100,
      ...this.dtoInclude(coachUserId, true),
    });
    return rows.map((r) => this.toDto(r, coachUserId, true));
  }

  async getOne(id: number, userId?: number): Promise<GroupSessionDto> {
    const s = await this.prisma.groupSession.findUnique({ where: { id }, ...this.dtoInclude(userId, true) });
    if (!s) throw new AppException('not_found');
    // The list of names is for the coach who runs it and nobody else.
    return this.toDto(s, userId, s.coach.userId === userId);
  }

  async register(id: number, userId: number): Promise<{ ok: true; spotsLeft: number }> {
    const session = await this.prisma.groupSession.findUnique({
      where: { id },
      include: { _count: { select: { registrations: true } } },
    });
    if (!session || session.cancelledAt) throw new AppException('not_found');
    if (session.endsAt <= new Date()) throw new AppException('policy_violation', { reason: 'ended' });
    await assertInGoodStanding(this.prisma, userId);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const count = await tx.groupSessionRegistration.count({ where: { groupSessionId: id } });
        if (count >= session.capacity) throw new AppException('policy_violation', { reason: 'full' });
        await tx.groupSessionRegistration.create({ data: { groupSessionId: id, userId } });
        return { ok: true as const, spotsLeft: session.capacity - count - 1 };
      });
    } catch (e) {
      if (e instanceof Error && e.message.includes('Unique constraint')) {
        return { ok: true as const, spotsLeft: Math.max(0, session.capacity - session._count.registrations) };
      }
      throw e;
    }
  }

  async unregister(id: number, userId: number): Promise<{ ok: true }> {
    await this.prisma.groupSessionRegistration.deleteMany({ where: { groupSessionId: id, userId } });
    return { ok: true as const };
  }

  /** Coach cancels their session: releases the reservation and emails registrants. */
  async cancel(id: number, coachUserId: number): Promise<{ ok: true }> {
    const session = await this.prisma.groupSession.findUnique({
      where: { id },
      include: {
        coach: { select: { userId: true } },
        club: { select: { name: true, timezone: true } },
        registrations: { select: { user: { select: { email: true, locale: true } } } },
      },
    });
    if (!session) throw new AppException('not_found');
    if (session.coach.userId !== coachUserId) throw new AppException('forbidden');
    if (session.cancelledAt) return { ok: true as const };

    await this.reservations.releaseReservation(session.reservationId, 'group_session_cancelled');
    await this.prisma.groupSession.update({ where: { id }, data: { cancelledAt: new Date() } });

    const when = formatInZone(session.startsAt, session.club.timezone, 'yyyy-MM-dd HH:mm');
    // In the background: the session is already off; a slow mail provider must
    // not keep the coach waiting for the answer.
    void Promise.all(
      session.registrations.map((reg) =>
        this.mail
          .sendGroupSessionCancelled(
            reg.user.email,
            { title: session.title, clubName: session.club.name, when },
            normalizeLocale(reg.user.locale),
          )
          .catch(() => undefined),
      ),
    );
    return { ok: true as const };
  }

  // ── internals ──

  private async invitePlayers(sessionId: number): Promise<void> {
    const session = await this.prisma.groupSession.findUnique({
      where: { id: sessionId },
      include: {
        coach: { select: { userId: true, user: { select: { name: true } } } },
        club: { select: { name: true, timezone: true } },
      },
    });
    if (!session || session.cancelledAt) return;

    const players = await this.prisma.user.findMany({
      where: {
        subscribed: true,
        id: { not: session.coach.userId },
        roles: { some: { role: 'PLAYER' } },
      },
      select: { email: true, locale: true },
      take: INVITE_CAP,
    });
    if (players.length === 0) return;

    const when = formatInZone(session.startsAt, session.club.timezone, 'yyyy-MM-dd HH:mm');
    const base = this.env.APP_BASE_URL.replace(/\/$/, '');
    let sent = 0;
    for (const p of players) {
      const locale = normalizeLocale(p.locale);
      await this.mail
        .sendGroupSessionInvite(
          p.email,
          {
            coachName: session.coach.user?.name ?? 'Coach',
            clubName: session.club.name,
            when,
            title: session.title,
            spotsLeft: session.capacity,
            priceCents: session.priceCents,
            currency: session.currency,
          },
          `${base}/${locale}/sessions`,
          locale,
        )
        .catch(() => undefined);
      sent++;
    }
    this.logger.log(`Invited ${sent} player(s) to group session ${sessionId}.`);
  }

  /**
   * What a session is read with. `withParticipants` loads everyone signed up
   * (for the coach); otherwise only the asking user's own registration, which
   * is all the "am I in?" flag needs.
   */
  private dtoInclude(userId?: number, withParticipants = false) {
    return {
      include: {
        coach: { select: { userId: true, photoUrl: true, user: { select: { name: true } } } },
        club: { select: { name: true } },
        reservation: {
          select: { resources: { select: { resource: { select: { name: true, type: true } } } } },
        },
        _count: { select: { registrations: true } },
        // One shape either way, so the result is typed the same: everyone for
        // the coach, otherwise just the asking user's row (nobody's, if anonymous).
        registrations: {
          where: withParticipants ? {} : { userId: userId ?? -1 },
          select: { userId: true, user: { select: { name: true } } },
          orderBy: { createdAt: 'asc' as const },
        },
      },
    };
  }

  private toDto(
    s: {
      id: number;
      coachProfileId: number;
      clubId: number;
      title: string;
      description: string | null;
      level: string | null;
      startsAt: Date;
      endsAt: Date;
      capacity: number;
      priceCents: number;
      currency: string;
      cancelledAt: Date | null;
      coach: { userId: number | null; photoUrl: string | null; user: { name: string } | null };
      club: { name: string };
      reservation: { resources: { resource: { name: string; type: string } }[] };
      _count: { registrations: number };
      registrations: { userId: number; user: { name: string } }[];
    },
    userId?: number,
    withParticipants = false,
  ): GroupSessionDto {
    const registeredCount = s._count.registrations;
    const regs = s.registrations;
    return {
      id: s.id,
      coachProfileId: s.coachProfileId,
      coachName: s.coach.user?.name ?? 'Coach',
      coachPhotoUrl: s.coach.photoUrl,
      clubId: s.clubId,
      clubName: s.club.name,
      title: s.title,
      description: s.description,
      level: s.level,
      courtName: s.reservation.resources.find((x) => x.resource.type === 'COURT')?.resource.name ?? null,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      capacity: s.capacity,
      priceCents: s.priceCents,
      currency: s.currency,
      registeredCount,
      spotsLeft: Math.max(0, s.capacity - registeredCount),
      registered: userId != null && regs.some((r) => r.userId === userId),
      cancelled: !!s.cancelledAt,
      mine: userId != null && s.coach.userId === userId,
      ...(withParticipants ? { participants: regs.map((r) => ({ userId: r.userId, name: r.user.name })) } : {}),
    };
  }
}
