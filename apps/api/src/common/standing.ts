import type { PrismaService } from '../prisma/prisma.service';
import { AppException } from './app-exception';
import { normalizeLocale, t } from './i18n';

/**
 * Throws when a platform admin has suspended the account (no-show,
 * non-payment…). Called by every player-initiated booking path so a restricted
 * player can't slip through a side door (group trainings, lessons…).
 */
export async function assertInGoodStanding(prisma: PrismaService, userId: number): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { suspendedAt: true, suspensionReason: true, reinstatementFeeCents: true, locale: true, deletedAt: true },
  });
  if (!user || user.deletedAt) throw new AppException('unauthenticated');
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
