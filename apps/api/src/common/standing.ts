import type { PrismaService } from '../prisma/prisma.service';
import { AppException } from './app-exception';
import { normalizeLocale, t } from './i18n';

/**
 * May this account book and play as a player? Called by every player-initiated
 * booking path (courts and lessons, games and group trainings) so nobody slips
 * through a side door. Throws when:
 * - a platform admin has suspended the account (no-show, non-payment…);
 * - the account is a platform admin's: they run the platform and are not a
 *   player on it (Anton's decision). They add bookings from a club's calendar.
 */
export async function assertInGoodStanding(prisma: PrismaService, userId: number): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      suspendedAt: true,
      suspensionReason: true,
      reinstatementFeeCents: true,
      locale: true,
      deletedAt: true,
      roles: { where: { role: 'PLATFORM_ADMIN' }, select: { role: true } },
    },
  });
  if (!user || user.deletedAt) throw new AppException('unauthenticated');
  if (user.roles.length > 0) throw new AppException('policy_violation', { reason: 'not_a_player' });
  if (!user.suspendedAt) return;
  throw new AppException(
    'policy_violation',
    {
      reason: 'account_suspended',
      suspensionReason: user.suspensionReason,
      feeCents: user.reinstatementFeeCents ?? 0,
    },
    t('account.suspended', normalizeLocale(user.locale)),
  );
}
