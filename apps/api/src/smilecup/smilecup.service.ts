import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@playslot/db';
import { formatInZone, instantFromDayMinutes } from '@playslot/domain';
import { AppException } from '../common/app-exception';
import { PrismaService } from '../prisma/prisma.service';
import { ReservationsService } from '../reservations/reservations.service';
import { fetchSmileCupTournaments, venueMatchesClub, type SmileCupTournament } from './smilecup-feed';

export interface BlockWindow {
  startMin: number;
  endMin: number;
  courtIds: number[];
}

interface Busy {
  reservationId: number;
  courtId: number;
  start: Date;
  end: Date;
  type: string;
  status: string;
  customerName: string | null;
  customerPhone: string | null;
  smilecupId: string | null;
}

/**
 * Smile Cup tournaments → blocked courts in a club's calendar. Nothing happens
 * on its own: the club admin checks the list, picks the hours and courts for a
 * tournament (the feed has no start time), previews what is in the way, and
 * blocks. Existing bookings are never touched — only the free time around them
 * is blocked, and they are listed so the club can sort them out.
 *
 * The blocks are ordinary TOURNAMENT reservations; `participants.smilecupId`
 * ties them to the tournament, so they can be shown, replaced and released.
 */
@Injectable()
export class SmileCupService {
  private readonly log = new Logger(SmileCupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reservations: ReservationsService,
  ) {}

  async list(clubId: number) {
    const club = await this.club(clubId);
    let feed: SmileCupTournament[];
    try {
      feed = await fetchSmileCupTournaments();
    } catch (e) {
      this.log.warn(`Smile Cup feed unavailable: ${String(e)}`);
      throw new AppException('internal', { reason: 'smilecup_unavailable' });
    }
    const courts = await this.courts(clubId);
    const blocks = await this.prisma.reservation.findMany({
      where: {
        clubId,
        type: 'TOURNAMENT',
        status: { not: 'CANCELLED' },
        participants: { path: ['source'], equals: 'smilecup' },
        endsAt: { gte: new Date() },
      },
      select: { id: true, startsAt: true, endsAt: true, participants: true, resources: { select: { resourceId: true } } },
    });

    const blocksFor = (id: string) => blocks.filter((b) => (b.participants as { smilecupId?: string } | null)?.smilecupId === id);
    const hhmmMin = (d: Date) => {
      const [h, m] = formatInZone(d, club.timezone, 'HH:mm').split(':').map(Number);
      return h! * 60 + m!;
    };

    return {
      slotIntervalMin: club.slotIntervalMin,
      courts: courts.map((c) => ({ id: c.id, name: c.name })),
      tournaments: feed.map((t) => {
        const mine = blocksFor(t.id);
        return {
          ...t,
          atThisClub: venueMatchesClub(t.venue, club.name),
          block: mine.length
            ? {
                reservationIds: mine.map((b) => b.id),
                startMin: Math.min(...mine.map((b) => hhmmMin(b.startsAt))),
                endMin: Math.max(...mine.map((b) => hhmmMin(b.endsAt))),
                courtIds: [...new Set(mine.flatMap((b) => b.resources.map((r) => r.resourceId)))],
              }
            : null,
        };
      }),
    };
  }

  /** What blocking `window` on the tournament's day would do, without doing it. */
  async preview(clubId: number, smilecupId: string, window: BlockWindow) {
    const { club, tournament } = await this.context(clubId, smilecupId);
    const plan = await this.plan(club, tournament, window);
    return {
      day: tournament.day,
      freeMinutes: plan.segments.reduce((sum, s) => sum + s.durationMin, 0),
      segments: plan.segments.length,
      conflicts: plan.conflicts.map((c) => ({
        reservationId: c.reservationId,
        courtId: c.courtId,
        courtName: plan.courtName(c.courtId),
        from: formatInZone(c.start, club.timezone, 'HH:mm'),
        to: formatInZone(c.end, club.timezone, 'HH:mm'),
        type: c.type,
        status: c.status,
        customerName: c.customerName,
        customerPhone: c.customerPhone,
      })),
    };
  }

  /**
   * Block the free time of `window` on the tournament's day. Blocks made for
   * this tournament earlier are replaced, so changing the hours is just
   * blocking again.
   */
  async block(clubId: number, smilecupId: string, window: BlockWindow, staffUserId: number) {
    const { club, tournament } = await this.context(clubId, smilecupId);
    const previous = await this.existingBlockIds(clubId, smilecupId);
    if (previous.length) await this.reservations.releaseBlocks(clubId, previous, staffUserId, 'smilecup_reblock');

    const plan = await this.plan(club, tournament, window);
    const meta = { source: 'smilecup', smilecupId, title: tournament.name, url: tournament.url, reason: tournament.name };
    let created = 0;
    const failed: { courtName: string; from: string; to: string }[] = [];
    for (const seg of plan.segments) {
      try {
        await this.reservations.createTournamentBlock(
          clubId,
          { startsAt: seg.start.toISOString(), durationMin: seg.durationMin, resourceIds: [seg.courtId], meta },
          staffUserId,
        );
        created++;
      } catch {
        // Booked in the meantime, a closure that day, or the start already
        // passed: that piece is reported and the rest still goes through.
        failed.push({
          courtName: plan.courtName(seg.courtId),
          from: formatInZone(seg.start, club.timezone, 'HH:mm'),
          to: formatInZone(new Date(seg.start.getTime() + seg.durationMin * 60_000), club.timezone, 'HH:mm'),
        });
      }
    }
    this.reservations.notifyAvailabilityChanged(clubId);
    return { created, failed, conflicts: plan.conflicts.length };
  }

  async release(clubId: number, smilecupId: string, staffUserId: number) {
    const ids = await this.existingBlockIds(clubId, smilecupId);
    const released = await this.reservations.releaseBlocks(clubId, ids, staffUserId, 'smilecup_released');
    return { released };
  }

  // ── internals ──

  private async club(clubId: number) {
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: { id: true, name: true, timezone: true, slotIntervalMin: true },
    });
    if (!club) throw new AppException('not_found');
    return club;
  }

  private courts(clubId: number) {
    return this.prisma.resource.findMany({
      where: { clubId, type: 'COURT', status: 'ACTIVE' },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  private async context(clubId: number, smilecupId: string) {
    const club = await this.club(clubId);
    let feed: SmileCupTournament[];
    try {
      feed = await fetchSmileCupTournaments();
    } catch {
      throw new AppException('internal', { reason: 'smilecup_unavailable' });
    }
    const tournament = feed.find((t) => t.id === smilecupId);
    if (!tournament) throw new AppException('not_found', { reason: 'tournament' });
    return { club, tournament };
  }

  private async existingBlockIds(clubId: number, smilecupId: string) {
    const rows = await this.prisma.reservation.findMany({
      where: {
        clubId,
        type: 'TOURNAMENT',
        status: { not: 'CANCELLED' },
        participants: { path: ['smilecupId'], equals: smilecupId },
      },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  /**
   * The free pieces of `window` on each chosen court, on the club's slot grid,
   * and everything already there. This tournament's own earlier blocks are not
   * counted as "in the way" — blocking again replaces them.
   */
  private async plan(
    club: { id: number; timezone: string; slotIntervalMin: number },
    tournament: SmileCupTournament,
    window: BlockWindow,
  ) {
    const step = club.slotIntervalMin;
    if (window.startMin % step !== 0 || window.endMin % step !== 0 || window.endMin <= window.startMin) {
      throw new AppException('validation_failed', { fields: { startMin: ['misaligned'] } });
    }
    const all = await this.courts(club.id);
    const courts = all.filter((c) => window.courtIds.includes(c.id));
    if (courts.length === 0) throw new AppException('validation_failed', { fields: { courtIds: ['required'] } });

    const from = instantFromDayMinutes(tournament.day, window.startMin, club.timezone);
    const to = instantFromDayMinutes(tournament.day, window.endMin, club.timezone);

    const busy = await this.prisma.$queryRaw<
      Array<{ reservationId: number; courtId: number; start: Date; end: Date; type: string; status: string; name: string | null; phone: string | null; participants: unknown }>
    >(Prisma.sql`
      SELECT r.id AS "reservationId", rr."resourceId" AS "courtId",
             lower(rr.period) AS start, upper(rr.period) AS "end",
             r.type::text AS type, r.status::text AS status,
             u.name AS name, u.phone AS phone, r.participants AS participants
        FROM "ReservationResource" rr
        JOIN "Reservation" r ON r.id = rr."reservationId"
        JOIN "User" u ON u.id = r."userId"
       WHERE rr."isActive"
         AND rr."resourceId" IN (${Prisma.join(courts.map((c) => c.id))})
         AND rr.period && tstzrange(${from}, ${to}, '[)')`);

    const items: Busy[] = busy.map((b) => {
      const p = (b.participants ?? {}) as { smilecupId?: string; name?: string };
      return {
        reservationId: b.reservationId,
        courtId: b.courtId,
        start: b.start,
        end: b.end,
        type: b.type,
        status: b.status,
        // A walk-in booked by staff carries the guest's name, not the staff's.
        customerName: p.name ?? b.name,
        customerPhone: b.phone,
        smilecupId: p.smilecupId ?? null,
      };
    });
    const inTheWay = items.filter((b) => b.smilecupId !== tournament.id);

    // Nothing in the past can be blocked: start at the next slot from now.
    const now = Date.now();
    const stepMs = step * 60_000;
    const earliest = Math.max(from.getTime(), Math.ceil(now / stepMs) * stepMs);

    const segments: { courtId: number; start: Date; durationMin: number }[] = [];
    for (const court of courts) {
      const taken = inTheWay
        .filter((b) => b.courtId === court.id)
        .map((b) => [b.start.getTime(), b.end.getTime()] as const)
        .sort((a, b) => a[0] - b[0]);
      let cursor = earliest;
      const push = (a: number, b: number) => {
        // Snap inwards onto the slot grid.
        const s = Math.ceil((a - from.getTime()) / stepMs) * stepMs + from.getTime();
        const e = Math.floor((b - from.getTime()) / stepMs) * stepMs + from.getTime();
        if (e > s) segments.push({ courtId: court.id, start: new Date(s), durationMin: (e - s) / 60_000 });
      };
      for (const [s, e] of taken) {
        if (s > cursor) push(cursor, Math.min(s, to.getTime()));
        cursor = Math.max(cursor, e);
      }
      if (cursor < to.getTime()) push(cursor, to.getTime());
    }

    const names = new Map(all.map((c) => [c.id, c.name]));
    return {
      segments,
      conflicts: inTheWay.sort((a, b) => a.start.getTime() - b.start.getTime()),
      courtName: (id: number) => names.get(id) ?? `#${id}`,
    };
  }
}
