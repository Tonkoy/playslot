import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ServerEnv } from '@playslot/config';
import { type CreateGroupSessionInput, type GroupSessionDto } from '@playslot/contracts';
import { formatInZone } from '@playslot/domain';
import { normalizeLocale } from '../common/i18n';
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

  async list(clubId: number | undefined, userId?: number): Promise<GroupSessionDto[]> {
    const rows = await this.prisma.groupSession.findMany({
      where: { cancelledAt: null, endsAt: { gt: new Date() }, ...(clubId ? { clubId } : {}) },
      orderBy: { startsAt: 'asc' },
      take: 100,
      ...this.dtoInclude(userId),
    });
    return rows.map((r) => this.toDto(r));
  }

  /** A coach's own sessions (upcoming + recent), including cancelled, for management. */
  async listMine(coachUserId: number): Promise<GroupSessionDto[]> {
    const profile = await this.prisma.coachProfile.findFirst({ where: { userId: coachUserId }, select: { id: true } });
    if (!profile) throw new AppException('forbidden', { reason: 'not_a_coach' });
    const rows = await this.prisma.groupSession.findMany({
      where: { coachProfileId: profile.id, endsAt: { gt: new Date(Date.now() - 7 * 86_400_000) } },
      orderBy: { startsAt: 'asc' },
      take: 100,
      ...this.dtoInclude(coachUserId),
    });
    return rows.map((r) => this.toDto(r));
  }

  async getOne(id: number, userId?: number): Promise<GroupSessionDto> {
    const s = await this.prisma.groupSession.findUnique({ where: { id }, ...this.dtoInclude(userId) });
    if (!s) throw new AppException('not_found');
    return this.toDto(s);
  }

  async register(id: number, userId: number): Promise<{ ok: true; spotsLeft: number }> {
    const session = await this.prisma.groupSession.findUnique({
      where: { id },
      include: { _count: { select: { registrations: true } } },
    });
    if (!session || session.cancelledAt) throw new AppException('not_found');
    if (session.endsAt <= new Date()) throw new AppException('policy_violation', { reason: 'ended' });

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
    for (const reg of session.registrations) {
      await this.mail
        .sendGroupSessionCancelled(
          reg.user.email,
          { title: session.title, clubName: session.club.name, when },
          normalizeLocale(reg.user.locale),
        )
        .catch(() => undefined);
    }
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

  private dtoInclude(userId?: number) {
    return {
      include: {
        coach: { select: { user: { select: { name: true } } } },
        club: { select: { name: true } },
        _count: { select: { registrations: true } },
        registrations: userId ? { where: { userId }, select: { id: true } } : (false as const),
      },
    };
  }

  private toDto(s: {
    id: number;
    coachProfileId: number;
    clubId: number;
    title: string;
    description: string | null;
    startsAt: Date;
    endsAt: Date;
    capacity: number;
    priceCents: number;
    currency: string;
    cancelledAt: Date | null;
    coach: { user: { name: string } | null };
    club: { name: string };
    _count: { registrations: number };
    registrations?: { id: number }[] | false;
  }): GroupSessionDto {
    const registeredCount = s._count.registrations;
    return {
      id: s.id,
      coachProfileId: s.coachProfileId,
      coachName: s.coach.user?.name ?? 'Coach',
      clubId: s.clubId,
      clubName: s.club.name,
      title: s.title,
      description: s.description,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      capacity: s.capacity,
      priceCents: s.priceCents,
      currency: s.currency,
      registeredCount,
      spotsLeft: Math.max(0, s.capacity - registeredCount),
      registered: Array.isArray(s.registrations) ? s.registrations.length > 0 : false,
      cancelled: !!s.cancelledAt,
    };
  }
}
