import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { ServerEnv } from '@playslot/config';
import { formatInZone, instantFromDayMinutes } from '@playslot/domain';
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { normalizeLocale } from '../common/i18n';
import { SERVER_ENV } from '../config/app-config.module';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';

const QUEUE_NAME = 'coach-schedule';
/** Local hour, per club timezone, at which each coach's daily digest goes out. */
const SEND_HOUR = 7;

interface CoachAgg {
  email: string;
  name: string;
  locale: string;
  lessons: { time: string; clubName: string; customerName: string }[];
}

/**
 * Daily coach schedule email (spec §19): every morning, each coach receives the
 * list of lessons they have that day. Implemented as a BullMQ repeatable job
 * that ticks hourly; on each tick every ACTIVE club whose local clock has just
 * reached {@link SEND_HOUR} is processed, so clubs in different timezones each
 * fire once per day without a separate cron per zone. Degrades gracefully to a
 * no-op when REDIS_URL is unset (the digest can still be sent by an explicit
 * call), so nothing here is required for the core booking flow.
 */
@Injectable()
export class CoachScheduleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('CoachSchedule');
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    @Inject(SERVER_ENV) private readonly env: ServerEnv,
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.env.NODE_ENV === 'test') return; // never touch Redis under test
    if (!this.env.REDIS_URL) {
      this.logger.warn('REDIS_URL not set — daily coach-schedule emails are disabled.');
      return;
    }
    const connection: ConnectionOptions = { url: this.env.REDIS_URL };
    this.queue = new Queue(QUEUE_NAME, { connection });
    this.worker = new Worker(
      QUEUE_NAME,
      async () => {
        const n = await this.sendDailySchedules(new Date());
        if (n > 0) this.logger.log(`Sent ${n} coach schedule email(s).`);
      },
      { connection },
    );
    this.worker.on('failed', (job, err) =>
      this.logger.error(`Coach-schedule job ${job?.id} failed: ${err.message}`),
    );
    // Tick at the top of every hour; the send-hour gate inside the handler picks
    // out the clubs whose local morning it now is.
    await this.queue.add(
      'tick',
      {},
      {
        repeat: { pattern: '0 * * * *' },
        jobId: 'coach-schedule-hourly',
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
    this.logger.log('Daily coach-schedule queue connected (hourly tick).');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  /**
   * Email each coach their lessons for the current day, but only for clubs whose
   * local time is right now {@link SEND_HOUR}. Callable directly (tests / manual
   * trigger) and safe without Redis. Returns the number of coach emails sent.
   */
  async sendDailySchedules(now: Date = new Date()): Promise<number> {
    const clubs = await this.prisma.club.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, timezone: true },
    });
    const byTz = new Map<string, number[]>();
    for (const c of clubs) {
      const list = byTz.get(c.timezone) ?? [];
      list.push(c.id);
      byTz.set(c.timezone, list);
    }

    let sent = 0;
    for (const [tz, clubIds] of byTz) {
      if (Number(formatInZone(now, tz, 'HH')) !== SEND_HOUR) continue;
      sent += await this.sendForTimezone(tz, clubIds, now);
    }
    return sent;
  }

  /**
   * Send digests for a specific set of same-timezone clubs regardless of the
   * hour gate. Used by the tick (per timezone) and available for a manual run.
   */
  async sendForTimezone(tz: string, clubIds: number[], now: Date = new Date()): Promise<number> {
    if (clubIds.length === 0) return 0;
    const dateStr = formatInZone(now, tz, 'yyyy-MM-dd');
    const dayStart = instantFromDayMinutes(dateStr, 0, tz);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const lessons = await this.prisma.reservation.findMany({
      where: {
        clubId: { in: clubIds },
        type: 'LESSON',
        status: 'CONFIRMED',
        startsAt: { gte: dayStart, lt: dayEnd },
      },
      orderBy: { startsAt: 'asc' },
      include: {
        club: { select: { name: true } },
        user: { select: { name: true, email: true } },
        resources: {
          select: {
            resource: {
              select: {
                type: true,
                coachProfile: {
                  select: {
                    user: { select: { id: true, email: true, name: true, locale: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    const byCoach = new Map<number, CoachAgg>();
    for (const r of lessons) {
      const coach = r.resources
        .map((x) => x.resource)
        .find((res) => res.type === 'COACH' && res.coachProfile?.user)?.coachProfile?.user;
      if (!coach) continue;
      const agg =
        byCoach.get(coach.id) ??
        ({ email: coach.email, name: coach.name, locale: coach.locale, lessons: [] } as CoachAgg);
      const walkin = r.user?.email.endsWith('@walkin.playslot.local') ?? true;
      const partName = (r.participants as { name?: string } | null)?.name;
      const customerName = (!walkin ? r.user?.name : undefined) ?? partName ?? 'PlaySlot customer';
      agg.lessons.push({
        time: formatInZone(r.startsAt, tz, 'HH:mm'),
        clubName: r.club.name,
        customerName,
      });
      byCoach.set(coach.id, agg);
    }

    let sent = 0;
    for (const agg of byCoach.values()) {
      await this.mail
        .sendCoachDailySchedule(
          agg.email,
          { coachName: agg.name, date: dateStr, lessons: agg.lessons },
          normalizeLocale(agg.locale),
        )
        .catch(() => undefined);
      sent++;
    }
    return sent;
  }
}
