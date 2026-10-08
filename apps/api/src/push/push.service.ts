import { Inject, Injectable, Logger } from '@nestjs/common';
import webpush from 'web-push';
import type { ServerEnv } from '@playslot/config';
import type { PushConfigDto, PushSubscribeInput } from '@playslot/contracts';
import { SERVER_ENV } from '../config/app-config.module';
import { PrismaService } from '../prisma/prisma.service';

export interface PushMessage {
  title: string;
  body: string;
  /** Path the browser opens when the notification is clicked. */
  url?: string;
  /** Collapses older notifications with the same tag. */
  tag?: string;
}

/**
 * Web Push delivery (spec §20). Without VAPID keys configured the service logs
 * instead of sending — the same fallback the mail provider uses, so local dev
 * and staging work without credentials.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger('Push');
  private readonly configured: boolean;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVER_ENV) private readonly env: ServerEnv,
  ) {
    this.configured = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
    if (this.configured) {
      webpush.setVapidDetails(
        env.VAPID_SUBJECT ?? `mailto:no-reply@playslot.bg`,
        env.VAPID_PUBLIC_KEY!,
        env.VAPID_PRIVATE_KEY!,
      );
    }
  }

  async config(userId: number): Promise<PushConfigDto> {
    const subscriptions = await this.prisma.pushSubscription.count({ where: { userId } });
    return { publicKey: this.configured ? (this.env.VAPID_PUBLIC_KEY ?? null) : null, subscriptions };
  }

  /** Idempotent: the endpoint is unique, and browsers re-issue the same one. */
  async subscribe(userId: number, input: PushSubscribeInput): Promise<void> {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: {
        userId,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        userAgent: input.userAgent ?? null,
      },
      // Re-subscribing on another account must move the row, not orphan it.
      update: { userId, p256dh: input.keys.p256dh, auth: input.keys.auth },
    });
  }

  async unsubscribe(userId: number, endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  }

  /**
   * Send to every browser this user has allowed. Subscriptions the push
   * service reports as gone (404/410) are deleted — they accumulate fast
   * otherwise, since a browser silently drops them on cache clears.
   */
  async sendToUser(userId: number, message: PushMessage): Promise<void> {
    const subs = await this.prisma.pushSubscription.findMany({ where: { userId } });
    if (subs.length === 0) return;

    if (!this.configured) {
      this.logger.log(`[dev-push] ${subs.length} sub(s) | ${message.title} — ${message.body}`);
      return;
    }

    const payload = JSON.stringify(message);
    const stale: string[] = [];

    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
          );
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) stale.push(s.endpoint);
          else this.logger.warn(`push failed (${status ?? 'unknown'}) for subscription ${s.id}`);
        }
      }),
    );

    if (stale.length > 0) {
      await this.prisma.pushSubscription.deleteMany({ where: { endpoint: { in: stale } } });
    }
  }
}
