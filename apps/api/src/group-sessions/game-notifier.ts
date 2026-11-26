import { Injectable, Logger, Module } from '@nestjs/common';
import { formatInZone } from '@playslot/domain';
import { normalizeLocale } from '../common/i18n';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { PushModule } from '../push/push.module';
import { PushService } from '../push/push.service';
import { gameNotice, type GameEvent, type GameInfo } from './game-copy';

const WHEN = 'dd.MM HH:mm';

/**
 * Tells people what happens around a session they organise or signed up for —
 * by push, and by email unless they turned emails off. It also keeps a session
 * in step with the booking under it: when that booking is cancelled or moved
 * from outside (the owner in "My bookings", club staff in the calendar), the
 * session follows and the people in it are told.
 *
 * Nothing here throws: by the time it runs, what it reports has been saved.
 * Callers do not wait for it (`void notifier.…`).
 */
@Injectable()
export class GameNotifier {
  private readonly logger = new Logger('GameNotifier');

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly push: PushService,
  ) {}

  /** One person, one event. */
  async notifyUser(userId: number, event: GameEvent, info: GameInfo): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, locale: true, notifyByEmail: true },
      });
      if (!user) return;
      const locale = normalizeLocale(user.locale);
      const notice = gameNotice(event, locale, info);
      const mailInfo = { title: info.title, clubName: info.clubName, when: info.when };
      const email = !user.notifyByEmail
        ? Promise.resolve()
        : event === 'cancelled'
          ? this.mail.sendGroupSessionCancelled(user.email, mailInfo, locale)
          : event === 'moved'
            ? this.mail.sendGroupSessionMoved(user.email, { ...mailInfo, previousWhen: info.previousWhen ?? info.when }, locale)
            : this.mail.sendGameNotice(user.email, notice.mail, { ...mailInfo, path: notice.path }, locale);
      const results = await Promise.allSettled([this.push.sendToUser(userId, notice.push), email]);
      for (const r of results) {
        if (r.status === 'rejected') this.logger.warn(`"${event}" notice to user ${userId} failed: ${String(r.reason)}`);
      }
    } catch (e) {
      this.logger.warn(`"${event}" notice to user ${userId} failed: ${String(e)}`);
    }
  }

  /** Everyone who signed up for, or asked to join, a session (not its organiser). */
  async notifyPlayers(sessionId: number, event: 'cancelled' | 'moved', extra: { previousWhen?: string } = {}): Promise<void> {
    try {
      const s = await this.prisma.groupSession.findUnique({
        where: { id: sessionId },
        select: {
          title: true,
          startsAt: true,
          club: { select: { name: true, timezone: true } },
          registrations: { select: { userId: true } },
        },
      });
      if (!s) return;
      const info: GameInfo = {
        sessionId,
        title: s.title,
        clubName: s.club.name,
        when: formatInZone(s.startsAt, s.club.timezone, WHEN),
        ...extra,
      };
      await Promise.all(s.registrations.map((r) => this.notifyUser(r.userId, event, info)));
    } catch (e) {
      this.logger.warn(`"${event}" notices for session ${sessionId} failed: ${String(e)}`);
    }
  }

  /** The booking under a session was cancelled: the session is off too. */
  async bookingCancelled(reservationId: number): Promise<void> {
    try {
      const s = await this.prisma.groupSession.findFirst({
        where: { reservationId, cancelledAt: null },
        select: { id: true },
      });
      if (!s) return;
      await this.prisma.groupSession.update({ where: { id: s.id }, data: { cancelledAt: new Date() } });
      await this.notifyPlayers(s.id, 'cancelled');
    } catch (e) {
      this.logger.warn(`Calling off the session of booking ${reservationId} failed: ${String(e)}`);
    }
  }

  /** The booking under a session was moved: the session takes its new time. */
  async bookingMoved(reservationId: number, previousStart: Date): Promise<void> {
    try {
      const s = await this.prisma.groupSession.findFirst({
        where: { reservationId, cancelledAt: null },
        select: {
          id: true,
          startsAt: true,
          club: { select: { timezone: true } },
          reservation: { select: { startsAt: true, endsAt: true } },
        },
      });
      if (!s) return;
      await this.prisma.groupSession.update({
        where: { id: s.id },
        data: { startsAt: s.reservation.startsAt, endsAt: s.reservation.endsAt },
      });
      if (s.reservation.startsAt.getTime() !== previousStart.getTime()) {
        await this.notifyPlayers(s.id, 'moved', { previousWhen: formatInZone(previousStart, s.club.timezone, WHEN) });
      }
    } catch (e) {
      this.logger.warn(`Moving the session of booking ${reservationId} failed: ${String(e)}`);
    }
  }
}

/** Its own module, because both the booking engine and the group sessions use it. */
@Module({
  imports: [PushModule],
  providers: [GameNotifier],
  exports: [GameNotifier],
})
export class GameNotifierModule {}
