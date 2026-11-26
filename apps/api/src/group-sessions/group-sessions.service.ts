import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ServerEnv } from '@playslot/config';
import {
  courtShareCents,
  type CostSplit,
  type CreateGroupSessionInput,
  type GroupSessionDto,
  type GroupSessionKind,
  type JoinMode,
  type OpenGameInput,
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
import type { GameInfo } from './game-copy';
import { GameNotifier } from './game-notifier';

const INVITE_CAP = 1000; // safety cap on invitation fan-out
const WHEN = 'dd.MM HH:mm';

/**
 * Sessions people sign up for on a reserved court (spec §10/§22).
 *
 * - A coach's group training: creation reserves the coach + a court via the
 *   booking engine (no double-booking) and invites subscribed players by email.
 * - A player's game: a player opens a court they already booked to others —
 *   sparring or a training among players. The booking stays theirs.
 *
 * Either way the organiser sees who signed up and is told when someone joins,
 * asks to join or leaves; with `joinMode: 'APPROVAL'` they let each person in.
 */
@Injectable()
export class GroupSessionsService {
  private readonly logger = new Logger('GroupSessions');

  constructor(
    private readonly prisma: PrismaService,
    private readonly reservations: ReservationsService,
    private readonly mail: MailService,
    private readonly notifier: GameNotifier,
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
        organizerUserId: coachUserId,
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
   * A player opens a court they booked to other players. The booking has to be
   * theirs, a plain court booking, confirmed and still ahead; it carries one
   * game at a time (a game that was called off can be opened again).
   */
  async openGame(userId: number, input: OpenGameInput): Promise<GroupSessionDto> {
    await assertInGoodStanding(this.prisma, userId);
    const booking = await this.prisma.reservation.findUnique({
      where: { id: input.reservationId },
      select: {
        userId: true,
        clubId: true,
        type: true,
        status: true,
        startsAt: true,
        endsAt: true,
        priceCents: true,
        currency: true,
        groupSession: { select: { id: true, cancelledAt: true } },
      },
    });
    // Someone else's booking is not there, as far as this player is concerned.
    if (!booking || booking.userId !== userId) throw new AppException('not_found');
    if (booking.type !== 'COURT') throw new AppException('policy_violation', { reason: 'not_a_court_booking' });
    if (booking.status !== 'CONFIRMED') throw new AppException('policy_violation', { reason: 'not_confirmed' });
    if (booking.startsAt <= new Date()) throw new AppException('policy_violation', { reason: 'ended' });
    if (booking.groupSession && !booking.groupSession.cancelledAt) {
      throw new AppException('policy_violation', { reason: 'already_open' });
    }

    const data = {
      coachProfileId: null,
      organizerUserId: userId,
      clubId: booking.clubId,
      title: input.title,
      description: input.description ?? null,
      level: input.level ?? null,
      kind: input.kind,
      joinMode: input.joinMode,
      costSplit: input.costSplit,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      capacity: input.capacity,
      priceCents: input.costSplit === 'SHARED' ? courtShareCents(booking.priceCents, input.capacity) : 0,
      currency: booking.currency,
      cancelledAt: null,
    };
    let id: number;
    if (booking.groupSession) {
      // One session per booking: a called-off game is opened again, with a clean list.
      id = booking.groupSession.id;
      await this.prisma.$transaction([
        this.prisma.groupSessionRegistration.deleteMany({ where: { groupSessionId: id } }),
        this.prisma.groupSession.update({ where: { id }, data }),
      ]);
    } else {
      id = (await this.prisma.groupSession.create({ data: { ...data, reservationId: input.reservationId } })).id;
    }
    return this.getOne(id, userId);
  }

  /**
   * The organiser changes their session. A coach can change its words, size,
   * price, level — and, with `slot`, its day and hour (through the booking
   * engine: the coach and the new court must both be free). A player's game
   * keeps the day and hour of its booking; its price follows from the court's.
   * Everyone signed up is told about a new time.
   */
  async update(id: number, userId: number, input: UpdateGroupSessionInput): Promise<GroupSessionDto> {
    const session = await this.prisma.groupSession.findUnique({
      where: { id },
      include: {
        club: { select: { timezone: true } },
        reservation: { select: { priceCents: true } },
        registrations: { where: { status: 'CONFIRMED' }, select: { id: true } },
      },
    });
    if (!session) throw new AppException('not_found');
    if (session.organizerUserId !== userId) throw new AppException('forbidden');
    if (session.cancelledAt || session.endsAt <= new Date()) {
      throw new AppException('policy_violation', { reason: 'ended' });
    }
    if (input.capacity != null && input.capacity < session.registrations.length) {
      throw new AppException('policy_violation', { reason: 'below_registered' });
    }
    const byPlayer = session.coachProfileId == null;
    if (byPlayer && input.slot) throw new AppException('policy_violation', { reason: 'not_reschedulable' });

    let times: { startsAt: Date; endsAt: Date } | null = null;
    if (input.slot) {
      const moved = await this.reservations.reschedule(
        session.clubId,
        session.reservationId,
        { startsAt: input.slot.startsAt, durationMin: input.slot.durationMin, resourceIds: [input.slot.courtId] },
        userId,
        // Those who signed up hear it from here, in words about a training.
        { notify: false },
      );
      const startsAt = new Date(moved.startsAt);
      times = { startsAt, endsAt: new Date(startsAt.getTime() + input.slot.durationMin * 60_000) };
    }

    // What others pay: the coach sets it; in a player's game it is a share of the court, or nothing.
    const capacity = input.capacity ?? session.capacity;
    const costSplit = byPlayer ? (input.costSplit ?? session.costSplit) : session.costSplit;
    const priceCents = byPlayer
      ? costSplit === 'SHARED'
        ? courtShareCents(session.reservation.priceCents, capacity)
        : 0
      : (input.priceCents ?? session.priceCents);

    await this.prisma.groupSession.update({
      where: { id },
      data: {
        ...(input.title != null ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
        ...(input.level !== undefined ? { level: input.level } : {}),
        capacity,
        priceCents,
        ...(byPlayer ? { costSplit, kind: input.kind ?? session.kind, joinMode: input.joinMode ?? session.joinMode } : {}),
        ...(times ?? {}),
      },
    });

    if (times && times.startsAt.getTime() !== session.startsAt.getTime()) {
      // In the background: the change is saved, telling people is a courtesy.
      void this.notifier.notifyPlayers(id, 'moved', {
        previousWhen: formatInZone(session.startsAt, session.club.timezone, WHEN),
      });
    }
    return this.getOne(id, userId);
  }

  async list(clubId: number | undefined, userId?: number): Promise<GroupSessionDto[]> {
    const rows = await this.prisma.groupSession.findMany({
      where: { cancelledAt: null, endsAt: { gt: new Date() }, ...(clubId ? { clubId } : {}) },
      orderBy: { startsAt: 'asc' },
      take: 100,
      ...DTO_INCLUDE,
    });
    return rows.map((r) => this.toDto(r, userId));
  }

  /** The sessions someone organises (upcoming + the last week), including called-off ones, for managing them. */
  async listMine(userId: number): Promise<GroupSessionDto[]> {
    const rows = await this.prisma.groupSession.findMany({
      where: { organizerUserId: userId, endsAt: { gt: new Date(Date.now() - 7 * 86_400_000) } },
      orderBy: { startsAt: 'asc' },
      take: 100,
      ...DTO_INCLUDE,
    });
    return rows.map((r) => this.toDto(r, userId));
  }

  async getOne(id: number, userId?: number): Promise<GroupSessionDto> {
    const s = await this.prisma.groupSession.findUnique({ where: { id }, ...DTO_INCLUDE });
    if (!s) throw new AppException('not_found');
    return this.toDto(s, userId);
  }

  /**
   * A player signs up. In an open session that takes a place at once; where the
   * organiser approves, it is a request that waits for them. Either way the
   * organiser is told. Signing up twice changes nothing.
   */
  async register(id: number, userId: number): Promise<{ ok: true; spotsLeft: number; status: 'CONFIRMED' | 'PENDING' }> {
    const session = await this.prisma.groupSession.findUnique({
      where: { id },
      select: { organizerUserId: true, capacity: true, joinMode: true, cancelledAt: true, endsAt: true },
    });
    if (!session || session.cancelledAt) throw new AppException('not_found');
    if (session.endsAt <= new Date()) throw new AppException('policy_violation', { reason: 'ended' });
    if (session.organizerUserId === userId) throw new AppException('policy_violation', { reason: 'own_session' });
    await assertInGoodStanding(this.prisma, userId);

    const status = session.joinMode === 'APPROVAL' ? ('PENDING' as const) : ('CONFIRMED' as const);
    const result = await this.prisma
      .$transaction(async (tx) => {
        const [taken, mine] = await Promise.all([
          tx.groupSessionRegistration.count({ where: { groupSessionId: id, status: 'CONFIRMED' } }),
          tx.groupSessionRegistration.findUnique({ where: { groupSessionId_userId: { groupSessionId: id, userId } } }),
        ]);
        if (mine) return { taken, status: mine.status === 'PENDING' ? ('PENDING' as const) : ('CONFIRMED' as const), fresh: false };
        if (taken >= session.capacity) throw new AppException('policy_violation', { reason: 'full' });
        await tx.groupSessionRegistration.create({ data: { groupSessionId: id, userId, status } });
        return { taken: taken + (status === 'CONFIRMED' ? 1 : 0), status, fresh: true };
      })
      .catch((e: unknown) => {
        // Two taps at once: the second finds the row the first just wrote.
        if (e instanceof Error && e.message.includes('Unique constraint')) return { taken: 0, status, fresh: false };
        throw e;
      });

    if (result.fresh) void this.tellOrganizer(id, status === 'PENDING' ? 'requested' : 'joined', userId);
    return { ok: true as const, spotsLeft: Math.max(0, session.capacity - result.taken), status: result.status };
  }

  /** A player gives up their place, or takes back a request. The organiser hears of a place that came free. */
  async unregister(id: number, userId: number): Promise<{ ok: true }> {
    const mine = await this.prisma.groupSessionRegistration.findUnique({
      where: { groupSessionId_userId: { groupSessionId: id, userId } },
      select: { status: true, session: { select: { cancelledAt: true, endsAt: true } } },
    });
    if (!mine) return { ok: true as const };
    await this.prisma.groupSessionRegistration.deleteMany({ where: { groupSessionId: id, userId } });
    const live = !mine.session.cancelledAt && mine.session.endsAt > new Date();
    if (live && mine.status === 'CONFIRMED') void this.tellOrganizer(id, 'left', userId);
    return { ok: true as const };
  }

  /** The organiser lets in someone who asked to join. */
  async approve(id: number, organizerUserId: number, playerUserId: number): Promise<GroupSessionDto> {
    const session = await this.ownLiveSession(id, organizerUserId);
    await this.prisma.$transaction(async (tx) => {
      const reg = await tx.groupSessionRegistration.findUnique({
        where: { groupSessionId_userId: { groupSessionId: id, userId: playerUserId } },
      });
      if (!reg) throw new AppException('not_found');
      if (reg.status === 'CONFIRMED') return; // a double click
      const taken = await tx.groupSessionRegistration.count({ where: { groupSessionId: id, status: 'CONFIRMED' } });
      if (taken >= session.capacity) throw new AppException('policy_violation', { reason: 'full' });
      await tx.groupSessionRegistration.update({ where: { id: reg.id }, data: { status: 'CONFIRMED' } });
    });
    void this.notifier.notifyUser(playerUserId, 'approved', session.info);
    return this.getOne(id, organizerUserId);
  }

  /** The organiser declines a request, or takes someone off the list. */
  async decline(id: number, organizerUserId: number, playerUserId: number): Promise<GroupSessionDto> {
    const session = await this.ownLiveSession(id, organizerUserId);
    const removed = await this.prisma.groupSessionRegistration.deleteMany({
      where: { groupSessionId: id, userId: playerUserId },
    });
    if (removed.count > 0) void this.notifier.notifyUser(playerUserId, 'declined', session.info);
    return this.getOne(id, organizerUserId);
  }

  /**
   * The organiser calls their session off; everyone signed up is told. A
   * coach's training gives its court back. A player's game does not: the court
   * is the player's own booking, which they keep (and cancel separately — that
   * calls the game off too, see GameNotifier.bookingCancelled).
   */
  async cancel(id: number, userId: number): Promise<{ ok: true }> {
    const session = await this.prisma.groupSession.findUnique({
      where: { id },
      select: { organizerUserId: true, coachProfileId: true, reservationId: true, cancelledAt: true },
    });
    if (!session) throw new AppException('not_found');
    if (session.organizerUserId !== userId) throw new AppException('forbidden');
    if (session.cancelledAt) return { ok: true as const };

    if (session.coachProfileId != null) {
      await this.reservations.releaseReservation(session.reservationId, 'group_session_cancelled');
    }
    await this.prisma.groupSession.update({ where: { id }, data: { cancelledAt: new Date() } });
    // In the background: the session is already off; a slow mail or push
    // provider must not keep the organiser waiting for the answer.
    void this.notifier.notifyPlayers(id, 'cancelled');
    return { ok: true as const };
  }

  // ── internals ──

  /** A session the user organises, not called off and not over — with the words a notice about it needs. */
  private async ownLiveSession(id: number, userId: number): Promise<{ capacity: number; info: GameInfo }> {
    const s = await this.prisma.groupSession.findUnique({
      where: { id },
      select: {
        organizerUserId: true,
        title: true,
        capacity: true,
        startsAt: true,
        endsAt: true,
        cancelledAt: true,
        club: { select: { name: true, timezone: true } },
      },
    });
    if (!s) throw new AppException('not_found');
    if (s.organizerUserId !== userId) throw new AppException('forbidden');
    if (s.cancelledAt || s.endsAt <= new Date()) throw new AppException('policy_violation', { reason: 'ended' });
    return {
      capacity: s.capacity,
      info: { sessionId: id, title: s.title, clubName: s.club.name, when: formatInZone(s.startsAt, s.club.timezone, WHEN) },
    };
  }

  /** Tell the organiser that a player joined, asked to join, or left. Never throws. */
  private async tellOrganizer(id: number, event: 'joined' | 'requested' | 'left', playerUserId: number): Promise<void> {
    try {
      const [s, player] = await Promise.all([
        this.prisma.groupSession.findUnique({
          where: { id },
          select: {
            organizerUserId: true,
            title: true,
            capacity: true,
            startsAt: true,
            club: { select: { name: true, timezone: true } },
            _count: { select: { registrations: { where: { status: 'CONFIRMED' } } } },
          },
        }),
        this.prisma.user.findUnique({ where: { id: playerUserId }, select: { name: true } }),
      ]);
      if (!s) return;
      await this.notifier.notifyUser(s.organizerUserId, event, {
        sessionId: id,
        title: s.title,
        clubName: s.club.name,
        when: formatInZone(s.startsAt, s.club.timezone, WHEN),
        playerName: player?.name,
        taken: s._count.registrations,
        capacity: s.capacity,
      });
    } catch (e) {
      this.logger.warn(`Telling the organiser of session ${id} about "${event}" failed: ${String(e)}`);
    }
  }

  private async invitePlayers(sessionId: number): Promise<void> {
    const session = await this.prisma.groupSession.findUnique({
      where: { id: sessionId },
      include: {
        organizer: { select: { name: true } },
        club: { select: { name: true, timezone: true } },
      },
    });
    if (!session || session.cancelledAt) return;

    const players = await this.prisma.user.findMany({
      where: {
        subscribed: true,
        id: { not: session.organizerUserId },
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
            coachName: session.organizer.name,
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

  private toDto(s: SessionRow, userId?: number): GroupSessionDto {
    const confirmed = s.registrations.filter((r) => r.status !== 'PENDING');
    const waiting = s.registrations.filter((r) => r.status === 'PENDING');
    const mine = userId != null && s.organizerUserId === userId;
    // A coach is shown with their coach photo; a player with their profile picture.
    const photo = s.coach?.photoUrl ?? s.organizer.avatarUrl;
    return {
      id: s.id,
      coachProfileId: s.coachProfileId,
      coachName: s.organizer.name,
      coachPhotoUrl: photo,
      organizerUserId: s.organizerUserId,
      organizerName: s.organizer.name,
      organizerPhotoUrl: photo,
      kind: s.kind as GroupSessionKind,
      joinMode: s.joinMode as JoinMode,
      costSplit: s.costSplit as CostSplit,
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
      registeredCount: confirmed.length,
      spotsLeft: Math.max(0, s.capacity - confirmed.length),
      registered: userId != null && confirmed.some((r) => r.userId === userId),
      pending: userId != null && waiting.some((r) => r.userId === userId),
      cancelled: !!s.cancelledAt,
      mine,
      // Who is coming is for the organiser and nobody else.
      ...(mine
        ? {
            pendingCount: waiting.length,
            participants: s.registrations.map((r) => ({
              userId: r.userId,
              name: r.user.name,
              photoUrl: r.user.avatarUrl,
              level: r.user.playerProfile?.level ?? null,
              status: r.status === 'PENDING' ? ('PENDING' as const) : ('CONFIRMED' as const),
            })),
          }
        : {}),
    };
  }
}

/**
 * What a session is read with. Everyone signed up is always read — the counts
 * and "am I in?" come from it — but the names leave the server only for the
 * organiser (see toDto).
 */
const DTO_INCLUDE = {
  include: {
    coach: { select: { photoUrl: true } },
    organizer: { select: { name: true, avatarUrl: true } },
    club: { select: { name: true } },
    reservation: {
      select: { resources: { select: { resource: { select: { name: true, type: true } } } } },
    },
    registrations: {
      select: {
        userId: true,
        status: true,
        user: { select: { name: true, avatarUrl: true, playerProfile: { select: { level: true } } } },
      },
      orderBy: { createdAt: 'asc' as const },
    },
  },
};

interface SessionRow {
  id: number;
  coachProfileId: number | null;
  organizerUserId: number;
  clubId: number;
  title: string;
  description: string | null;
  level: string | null;
  kind: string;
  joinMode: string;
  costSplit: string;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  priceCents: number;
  currency: string;
  cancelledAt: Date | null;
  coach: { photoUrl: string | null } | null;
  organizer: { name: string; avatarUrl: string | null };
  club: { name: string };
  reservation: { resources: { resource: { name: string; type: string } }[] };
  registrations: {
    userId: number;
    status: string;
    user: { name: string; avatarUrl: string | null; playerProfile: { level: string | null } | null };
  }[];
}
