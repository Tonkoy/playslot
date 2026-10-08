import { Injectable } from '@nestjs/common';
import type { ClubFeedbackDto, FeedbackInput, FeedbackItemDto } from '@playslot/contracts';
import { AppException } from '../common/app-exception';
import { PrismaService } from '../prisma/prisma.service';

/** How far back a player can still rate something. */
const FEEDBACK_WINDOW_DAYS = 60;
/** Reservation states that mean the player actually had the slot. */
const ATTENDED = ['CONFIRMED', 'COMPLETED'] as const;

/**
 * Session feedback: players rate what they attended — a past court booking, a
 * lesson, or a group training — and lesson/training ratings roll up into the
 * coach's public rating. Eligibility is always decided here, never trusted
 * from the client: you can only rate your own, finished, non-cancelled items.
 */
@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  async listMine(userId: number): Promise<FeedbackItemDto[]> {
    const now = new Date();
    const since = new Date(now.getTime() - FEEDBACK_WINDOW_DAYS * 86_400_000);

    const [reservations, registrations, mine] = await Promise.all([
      this.prisma.reservation.findMany({
        where: {
          userId,
          type: { in: ['COURT', 'LESSON'] },
          status: { in: [...ATTENDED] },
          endsAt: { lt: now, gte: since },
          // A group training's backing reservation belongs to the coach.
          groupSession: null,
        },
        include: {
          club: { select: { name: true } },
          resources: {
            select: {
              resource: {
                select: { type: true, coachProfileId: true, coachProfile: { select: { user: { select: { name: true } } } } },
              },
            },
          },
        },
        orderBy: { startsAt: 'desc' },
        take: 50,
      }),
      this.prisma.groupSessionRegistration.findMany({
        where: {
          userId,
          session: { cancelledAt: null, endsAt: { lt: now, gte: since } },
        },
        include: {
          session: {
            include: { club: { select: { name: true } }, coach: { select: { user: { select: { name: true } } } } },
          },
        },
        take: 50,
      }),
      this.prisma.sessionFeedback.findMany({
        where: { userId },
        select: { reservationId: true, groupSessionId: true, rating: true, comment: true },
      }),
    ]);

    const byRes = new Map(mine.filter((f) => f.reservationId).map((f) => [f.reservationId!, f]));
    const byGroup = new Map(mine.filter((f) => f.groupSessionId).map((f) => [f.groupSessionId!, f]));

    const items: FeedbackItemDto[] = [
      ...reservations.map((r) => {
        const coach = r.resources.find((x) => x.resource.type === 'COACH')?.resource;
        const fb = byRes.get(r.id);
        return {
          kind: 'reservation' as const,
          id: r.id,
          clubId: r.clubId,
          clubName: r.club.name,
          type: r.type,
          title: null,
          coachProfileId: coach?.coachProfileId ?? null,
          coachName: coach?.coachProfile?.user.name ?? null,
          startsAt: r.startsAt.toISOString(),
          endsAt: r.endsAt.toISOString(),
          myRating: fb?.rating ?? null,
          myComment: fb?.comment ?? null,
        };
      }),
      ...registrations.map((g) => {
        const fb = byGroup.get(g.groupSessionId);
        return {
          kind: 'group' as const,
          id: g.groupSessionId,
          clubId: g.session.clubId,
          clubName: g.session.club.name,
          type: 'GROUP',
          title: g.session.title,
          coachProfileId: g.session.coachProfileId,
          coachName: g.session.coach.user.name,
          startsAt: g.session.startsAt.toISOString(),
          endsAt: g.session.endsAt.toISOString(),
          myRating: fb?.rating ?? null,
          myComment: fb?.comment ?? null,
        };
      }),
    ];
    return items.sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  }

  async submit(userId: number, input: FeedbackInput): Promise<{ ok: true }> {
    const now = new Date();
    const comment = input.comment ? input.comment : null;

    if (input.kind === 'reservation') {
      const r = await this.prisma.reservation.findFirst({
        where: { id: input.id, userId, type: { in: ['COURT', 'LESSON'] }, groupSession: null },
        include: { resources: { select: { resource: { select: { type: true, coachProfileId: true } } } } },
      });
      if (!r) throw new AppException('not_found');
      this.assertRateable(r.endsAt, now, (ATTENDED as readonly string[]).includes(r.status));
      const coachProfileId = r.resources.find((x) => x.resource.type === 'COACH')?.resource.coachProfileId ?? null;

      await this.prisma.sessionFeedback.upsert({
        where: { userId_reservationId: { userId, reservationId: r.id } },
        create: { userId, clubId: r.clubId, reservationId: r.id, coachProfileId, rating: input.rating, comment },
        update: { rating: input.rating, comment },
      });
      return { ok: true };
    }

    const reg = await this.prisma.groupSessionRegistration.findUnique({
      where: { groupSessionId_userId: { groupSessionId: input.id, userId } },
      include: { session: true },
    });
    if (!reg) throw new AppException('not_found');
    this.assertRateable(reg.session.endsAt, now, reg.session.cancelledAt === null);

    await this.prisma.sessionFeedback.upsert({
      where: { userId_groupSessionId: { userId, groupSessionId: input.id } },
      create: {
        userId,
        clubId: reg.session.clubId,
        groupSessionId: input.id,
        coachProfileId: reg.session.coachProfileId,
        rating: input.rating,
        comment,
      },
      update: { rating: input.rating, comment },
    });
    return { ok: true };
  }

  /** Club staff view: everything players said about this club's sessions. */
  async listForClub(clubId: number): Promise<ClubFeedbackDto> {
    const [rows, agg] = await Promise.all([
      this.prisma.sessionFeedback.findMany({
        where: { clubId },
        include: {
          user: { select: { name: true } },
          coach: { select: { user: { select: { name: true } } } },
          reservation: { select: { type: true, startsAt: true } },
          groupSession: { select: { title: true, startsAt: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.sessionFeedback.aggregate({ where: { clubId }, _avg: { rating: true }, _count: { _all: true } }),
    ]);
    return {
      averageRating: agg._avg.rating != null ? Math.round(agg._avg.rating * 10) / 10 : null,
      count: agg._count._all,
      items: rows.map((f) => ({
        id: f.id,
        rating: f.rating,
        comment: f.comment,
        authorName: f.user.name,
        createdAt: f.createdAt.toISOString(),
        type: f.groupSession ? 'GROUP' : (f.reservation?.type ?? 'COURT'),
        title: f.groupSession?.title ?? null,
        coachName: f.coach?.user.name ?? null,
        startsAt: (f.groupSession?.startsAt ?? f.reservation?.startsAt ?? f.createdAt).toISOString(),
      })),
    };
  }

  private assertRateable(endsAt: Date, now: Date, attended: boolean): void {
    if (!attended) throw new AppException('policy_violation', { reason: 'not_attended' });
    if (endsAt > now) throw new AppException('policy_violation', { reason: 'not_finished' });
    if (now.getTime() - endsAt.getTime() > FEEDBACK_WINDOW_DAYS * 86_400_000) {
      throw new AppException('policy_violation', { reason: 'feedback_window_closed' });
    }
  }
}
