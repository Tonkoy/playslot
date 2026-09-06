import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { ServerEnv } from '@playslot/config';
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { SERVER_ENV } from '../config/app-config.module';
import { ReservationsService } from './reservations.service';

const QUEUE_NAME = 'booking-holds';

interface ExpiryJob {
  reservationId: number;
}

/**
 * Hold-expiry via BullMQ (spec §8/§19): when a booking is left unpaid past its
 * HOLD_TTL, a delayed job cancels it and releases inventory. Idempotent — the
 * worker no-ops if the reservation already moved on. Degrades gracefully to a
 * no-op when REDIS_URL is unset (e.g. unit/integration runs), so the booking
 * transaction and its DB-level guarantee never depend on Redis being present.
 */
@Injectable()
export class HoldQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('HoldQueue');
  private queue?: Queue<ExpiryJob>;
  private worker?: Worker<ExpiryJob>;

  constructor(
    @Inject(SERVER_ENV) private readonly env: ServerEnv,
    @Inject(forwardRef(() => ReservationsService))
    private readonly reservations: ReservationsService,
  ) {}

  onModuleInit(): void {
    if (!this.env.REDIS_URL) {
      this.logger.warn('REDIS_URL not set — hold expiry runs only via explicit calls.');
      return;
    }
    const connection: ConnectionOptions = { url: this.env.REDIS_URL };
    this.queue = new Queue<ExpiryJob>(QUEUE_NAME, { connection });
    this.worker = new Worker<ExpiryJob>(
      QUEUE_NAME,
      async (job) => {
        await this.reservations.expireHold(job.data.reservationId);
      },
      { connection },
    );
    this.worker.on('failed', (job, err) =>
      this.logger.error(`Hold-expiry job ${job?.id} failed: ${err.message}`),
    );
    this.logger.log('Hold-expiry queue connected.');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  /** Schedule a hold to be cancelled at `expiresAt` if still unpaid. */
  async scheduleExpiry(reservationId: number, expiresAt: Date): Promise<void> {
    if (!this.queue) return;
    const delay = Math.max(0, expiresAt.getTime() - Date.now());
    await this.queue.add(
      'expire',
      { reservationId },
      { delay, jobId: `hold-${reservationId}`, removeOnComplete: true, removeOnFail: true },
    );
  }
}
