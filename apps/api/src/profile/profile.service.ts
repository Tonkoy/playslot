import { Injectable } from '@nestjs/common';
import { type PlayerLevel, type UpdateUserProfileInput, type UserProfileDto } from '@playslot/contracts';
import { AppException } from '../common/app-exception';
import { PrismaService } from '../prisma/prisma.service';

/** A user's own account profile (name, avatar, bio, notification preferences). */
@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyProfile(userId: number): Promise<UserProfileDto> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        email: true,
        avatarUrl: true,
        bio: true,
        subscribed: true,
        notifyByEmail: true,
        phone: true,
        playerProfile: { select: { level: true } },
      },
    });
    if (!u) throw new AppException('not_found');
    const { playerProfile, ...user } = u;
    return { ...user, level: (playerProfile?.level as PlayerLevel | null) ?? null };
  }

  async updateMyProfile(userId: number, input: UpdateUserProfileInput): Promise<UserProfileDto> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl || null } : {}),
        ...(input.bio !== undefined ? { bio: input.bio || null } : {}),
        ...(input.subscribed !== undefined ? { subscribed: input.subscribed } : {}),
        ...(input.notifyByEmail !== undefined ? { notifyByEmail: input.notifyByEmail } : {}),
        // The contract already normalised this to +359… or null.
        ...(input.phone !== undefined ? { phone: input.phone ?? null } : {}),
      },
    });

    // The level lives on PlayerProfile, which registration creates — but
    // upsert rather than update, so an account seeded or imported without one
    // can still set a level instead of failing on a missing row.
    if (input.level !== undefined) {
      await this.prisma.playerProfile.upsert({
        where: { userId },
        create: { userId, level: input.level ?? null },
        update: { level: input.level ?? null },
      });
    }

    return this.getMyProfile(userId);
  }
}
