import { Injectable } from '@nestjs/common';
import { type UpdateUserProfileInput, type UserProfileDto } from '@playslot/contracts';
import { AppException } from '../common/app-exception';
import { PrismaService } from '../prisma/prisma.service';

/** A user's own account profile (name, avatar, bio, notification preferences). */
@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyProfile(userId: number): Promise<UserProfileDto> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, avatarUrl: true, bio: true, subscribed: true, notifyByEmail: true },
    });
    if (!u) throw new AppException('not_found');
    return u;
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
      },
    });
    return this.getMyProfile(userId);
  }
}
