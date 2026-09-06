import { Injectable } from '@nestjs/common';
import {
  type ClubReviews,
  type FavoriteClub,
  type ReviewInput,
} from '@playslot/contracts';
import { AppException } from '../common/app-exception';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CommunityService {
  constructor(private readonly prisma: PrismaService) {}

  // ── favorites ──
  async listFavorites(userId: number): Promise<FavoriteClub[]> {
    const favs = await this.prisma.favorite.findMany({
      where: { userId },
      select: { club: { select: { id: true, slug: true, name: true, city: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    return favs.map((f) => ({
      id: f.club.id,
      slug: f.club.slug,
      name: f.club.name,
      cityName: f.club.city.name,
    }));
  }

  async addFavorite(userId: number, clubId: number): Promise<{ ok: true }> {
    const club = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (!club) throw new AppException('not_found');
    await this.prisma.favorite.upsert({
      where: { userId_clubId: { userId, clubId } },
      create: { userId, clubId },
      update: {},
    });
    return { ok: true };
  }

  async removeFavorite(userId: number, clubId: number): Promise<{ ok: true }> {
    await this.prisma.favorite.deleteMany({ where: { userId, clubId } });
    return { ok: true };
  }

  // ── reviews ──
  async listReviews(clubId: number): Promise<ClubReviews> {
    const [rows, agg] = await Promise.all([
      this.prisma.review.findMany({
        where: { clubId },
        select: { id: true, rating: true, comment: true, createdAt: true, user: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.review.aggregate({ where: { clubId }, _avg: { rating: true }, _count: true }),
    ]);
    return {
      averageRating: agg._avg.rating != null ? Math.round(agg._avg.rating * 10) / 10 : null,
      count: agg._count,
      reviews: rows.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        authorName: r.user?.name ?? 'Player',
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  /** Only customers with a past booking at the club may review it (anti-spam). */
  async upsertReview(clubId: number, userId: number, input: ReviewInput) {
    const club = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (!club) throw new AppException('not_found');

    const past = await this.prisma.reservation.findFirst({
      where: {
        clubId,
        userId,
        type: { in: ['COURT', 'LESSON'] },
        status: { in: ['CONFIRMED', 'COMPLETED', 'NO_SHOW'] },
        startsAt: { lt: new Date() },
      },
      select: { id: true },
    });
    if (!past) throw new AppException('policy_violation', { reason: 'no_past_booking' });

    const review = await this.prisma.review.upsert({
      where: { clubId_userId: { clubId, userId } },
      create: { clubId, userId, rating: input.rating, comment: input.comment ?? null },
      update: { rating: input.rating, comment: input.comment ?? null },
    });
    return { id: review.id, rating: review.rating };
  }
}
