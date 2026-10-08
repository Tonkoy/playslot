import { Injectable } from '@nestjs/common';
import {
  REINSTATEMENT_FEE_CENTS,
  REINSTATEMENT_FEE_CURRENCY,
  type AccountStandingDto,
  type DeleteUserInput,
  type DeleteUserResultDto,
  type PlatformUserDto,
  type ReinstateUserInput,
  type SuspendUserInput,
} from '@playslot/contracts';
import { Prisma, Role } from '@playslot/db';
import { AppException } from '../common/app-exception';
import { PrismaService } from '../prisma/prisma.service';

/** Reservation states that still hold a court (and can be cancelled). */
const ACTIVE_STATES = ['HOLD', 'PENDING_PAYMENT', 'CONFIRMED'] as const;

/**
 * Platform-admin moderation: suspend a player (no-show, non-payment…) until a
 * reinstatement fee is settled, lift the suspension, or delete an account that
 * should never have existed. Every action is audit-logged.
 */
@Injectable()
export class ModerationService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: string | undefined, onlySuspended: boolean): Promise<PlatformUserDto[]> {
    const q = query?.trim();
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        ...(onlySuspended ? { suspendedAt: { not: null } } : {}),
        ...(q
          ? {
              OR: [
                { email: { contains: q, mode: 'insensitive' } },
                { name: { contains: q, mode: 'insensitive' } },
                { phone: { contains: q } },
              ],
            }
          : {}),
      },
      include: { roles: true },
      orderBy: [{ suspendedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: 100,
    });

    const ids = users.map((u) => u.id);
    const now = new Date();
    const [noShows, unpaid, totals] = await Promise.all([
      this.prisma.reservation.groupBy({
        by: ['userId'],
        where: { userId: { in: ids }, status: 'NO_SHOW' },
        _count: { _all: true },
      }),
      // A pending-payment booking whose time has already passed was never paid.
      this.prisma.reservation.groupBy({
        by: ['userId'],
        where: { userId: { in: ids }, status: 'PENDING_PAYMENT', startsAt: { lt: now } },
        _count: { _all: true },
      }),
      this.prisma.reservation.groupBy({
        by: ['userId'],
        where: { userId: { in: ids }, type: { in: ['COURT', 'LESSON'] } },
        _count: { _all: true },
      }),
    ]);
    const count = (rows: { userId: number; _count: { _all: number } }[]) =>
      new Map(rows.map((r) => [r.userId, r._count._all]));
    const noShowBy = count(noShows);
    const unpaidBy = count(unpaid);
    const totalBy = count(totals);

    return users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      roles: u.roles.map((r) => r.role),
      emailVerified: u.emailVerifiedAt !== null,
      createdAt: u.createdAt.toISOString(),
      noShowCount: noShowBy.get(u.id) ?? 0,
      unpaidCount: unpaidBy.get(u.id) ?? 0,
      bookingCount: totalBy.get(u.id) ?? 0,
      suspendedAt: u.suspendedAt?.toISOString() ?? null,
      suspensionReason: u.suspensionReason,
      suspensionNote: u.suspensionNote,
      reinstatementFeeCents: u.reinstatementFeeCents,
    }));
  }

  async suspend(userId: number, input: SuspendUserInput, actorUserId: number): Promise<{ ok: true; cancelled: number }> {
    const user = await this.loadTarget(userId, actorUserId);
    const now = new Date();

    const cancelled = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          suspendedAt: now,
          suspensionReason: input.reason,
          suspensionNote: input.note || null,
          reinstatementFeeCents: input.feeCents,
        },
      });
      let n = 0;
      if (input.cancelUpcoming) {
        const res = await tx.reservation.updateMany({
          where: { userId, status: { in: [...ACTIVE_STATES] }, startsAt: { gt: now } },
          data: { status: 'CANCELLED', cancellationReason: `account_suspended:${input.reason}` },
        });
        const regs = await tx.groupSessionRegistration.deleteMany({
          where: { userId, session: { startsAt: { gt: now } } },
        });
        n = res.count + regs.count;
      }
      await this.audit(tx, actorUserId, 'user.suspend', userId, pickModeration(user), {
        reason: input.reason,
        note: input.note ?? null,
        feeCents: input.feeCents,
        cancelledUpcoming: n,
      });
      return n;
    });
    return { ok: true, cancelled };
  }

  async reinstate(userId: number, input: ReinstateUserInput, actorUserId: number): Promise<{ ok: true }> {
    const user = await this.loadTarget(userId, actorUserId);
    if (!user.suspendedAt) return { ok: true };
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { suspendedAt: null, suspensionReason: null, suspensionNote: null, reinstatementFeeCents: null },
      });
      await this.audit(tx, actorUserId, input.feePaid ? 'user.reinstate.fee_paid' : 'user.reinstate.fee_waived', userId, pickModeration(user), {
        feeCents: input.feePaid ? (user.reinstatementFeeCents ?? 0) : 0,
        currency: REINSTATEMENT_FEE_CURRENCY,
      });
    });
    return { ok: true };
  }

  /**
   * Remove an account registered by mistake (duplicate, fake, typo'd email).
   * With no history the row is deleted outright; otherwise it is anonymized so
   * clubs' booking history and revenue stay intact while the person's data
   * (name, email, phone, logins) is gone.
   */
  async remove(userId: number, input: DeleteUserInput, actorUserId: number): Promise<DeleteUserResultDto> {
    const user = await this.loadTarget(userId, actorUserId);
    const snapshot = { email: user.email, name: user.name, note: input.note ?? null };

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.user.delete({ where: { id: userId } });
        await this.audit(tx, actorUserId, 'user.delete', userId, snapshot, null);
      });
      return { mode: 'deleted' };
    } catch (err) {
      // P2003: rows elsewhere still reference the user (bookings, memberships…).
      if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2003') throw err;
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.reservation.updateMany({
        where: { userId, status: { in: [...ACTIVE_STATES] }, startsAt: { gt: now } },
        data: { status: 'CANCELLED', cancellationReason: 'account_deleted' },
      });
      await tx.groupSessionRegistration.deleteMany({ where: { userId, session: { startsAt: { gt: now } } } });
      await Promise.all([
        tx.oAuthAccount.deleteMany({ where: { userId } }),
        tx.verificationToken.deleteMany({ where: { userId } }),
        tx.pushSubscription.deleteMany({ where: { userId } }),
        tx.favorite.deleteMany({ where: { userId } }),
        tx.clubMember.deleteMany({ where: { userId } }),
        tx.userRole.deleteMany({ where: { userId } }),
      ]);
      await tx.user.update({
        where: { id: userId },
        data: {
          email: `deleted-${userId}@users.playslot.invalid`,
          name: 'Изтрит потребител',
          phone: null,
          passwordHash: null,
          avatarUrl: null,
          bio: null,
          isVisible: false,
          subscribed: false,
          notifyByEmail: false,
          deletedAt: now,
        },
      });
      await this.audit(tx, actorUserId, 'user.anonymize', userId, snapshot, null);
    });
    return { mode: 'anonymized' };
  }

  async standing(userId: number): Promise<AccountStandingDto> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { suspendedAt: true, suspensionReason: true, suspensionNote: true, reinstatementFeeCents: true },
    });
    return {
      suspended: Boolean(u?.suspendedAt),
      reason: u?.suspensionReason ?? null,
      note: u?.suspensionNote ?? null,
      feeCents: u?.suspendedAt ? (u.reinstatementFeeCents ?? REINSTATEMENT_FEE_CENTS) : 0,
      currency: REINSTATEMENT_FEE_CURRENCY,
    };
  }

  /** Admins can't act on themselves or on another platform admin. */
  /**
   * Platform admin approves a registration by hand: marks the email as
   * verified without the user clicking the email link. Idempotent; audited.
   */
  async verifyEmail(userId: number, actorUserId: number): Promise<{ ok: true; alreadyVerified: boolean }> {
    const user = await this.loadTarget(userId, actorUserId);
    if (user.emailVerifiedAt) return { ok: true, alreadyVerified: true };
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
      await this.audit(tx, actorUserId, 'user.verify_email.manual', userId, { emailVerified: false }, { emailVerified: true });
    });
    return { ok: true, alreadyVerified: false };
  }

  private async loadTarget(userId: number, actorUserId: number) {
    if (userId === actorUserId) throw new AppException('forbidden', { reason: 'self' });
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { roles: true } });
    if (!user || user.deletedAt) throw new AppException('not_found');
    if (user.roles.some((r) => r.role === Role.PLATFORM_ADMIN)) {
      throw new AppException('forbidden', { reason: 'platform_admin' });
    }
    return user;
  }

  private audit(
    tx: Prisma.TransactionClient,
    actorUserId: number,
    action: string,
    objectId: number,
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
  ) {
    return tx.auditLog.create({
      data: {
        actorUserId,
        action,
        objectType: 'User',
        objectId,
        before: (before ?? undefined) as Prisma.InputJsonValue | undefined,
        after: (after ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }
}

function pickModeration(u: {
  suspendedAt: Date | null;
  suspensionReason: string | null;
  suspensionNote: string | null;
  reinstatementFeeCents: number | null;
}) {
  return {
    suspendedAt: u.suspendedAt?.toISOString() ?? null,
    suspensionReason: u.suspensionReason,
    suspensionNote: u.suspensionNote,
    reinstatementFeeCents: u.reinstatementFeeCents,
  };
}
