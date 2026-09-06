import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import type { ServerEnv } from '@playslot/config';
import { AppException } from '../common/app-exception';
import { SERVER_ENV } from '../config/app-config.module';
import { PrismaService } from '../prisma/prisma.service';
import { ReservationsService } from '../reservations/reservations.service';
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment-provider';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger('Payments');

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    @Inject(SERVER_ENV) private readonly env: ServerEnv,
    @Inject(forwardRef(() => ReservationsService))
    private readonly reservations: ReservationsService,
  ) {}

  /** Create a hosted checkout for a PENDING_PAYMENT reservation (spec §17). */
  async createCheckout(input: {
    reservationId: number;
    amountCents: number;
    currency: string;
    description: string;
    customerEmail?: string;
    locale: string;
  }): Promise<{ url: string }> {
    const base = this.env.APP_BASE_URL.replace(/\/$/, '');
    const result = await this.provider.createCheckout({
      reservationId: input.reservationId,
      amountCents: input.amountCents,
      currency: input.currency,
      description: input.description,
      customerEmail: input.customerEmail,
      successUrl: `${base}/${input.locale}/me/bookings?status=success`,
      cancelUrl: `${base}/${input.locale}/me/bookings?status=cancelled`,
    });

    await this.prisma.payment.upsert({
      where: { reservationId: input.reservationId },
      create: {
        reservationId: input.reservationId,
        provider: this.provider.name,
        providerRef: result.sessionRef,
        amountCents: input.amountCents,
        currency: input.currency,
        status: 'PENDING',
      },
      update: { provider: this.provider.name, providerRef: result.sessionRef, status: 'PENDING' },
    });
    return { url: result.url };
  }

  /**
   * Handle a signed webhook (spec §17). Idempotent: the reservation transitions
   * are guarded by status, so a replayed event is a no-op.
   */
  async handleWebhook(rawBody: Buffer | string | undefined, signature: string | undefined) {
    if (!rawBody) throw new AppException('validation_failed', { reason: 'missing_body' });
    let event;
    try {
      event = this.provider.parseWebhook(rawBody, signature ?? '');
    } catch (e) {
      this.logger.warn(`Webhook signature verification failed: ${(e as Error).message}`);
      throw new AppException('unauthenticated', undefined, 'Invalid webhook signature');
    }

    if (event.kind === 'paid') {
      await this.reservations.confirmPaidReservation(event.reservationId, event.paymentRef);
    } else if (event.kind === 'failed') {
      await this.reservations.failPayment(event.reservationId);
    }
    return { received: true };
  }

  /** Issue a refund against a captured payment reference. */
  async refund(paymentRef: string, amountCents: number): Promise<string> {
    const res = await this.provider.refund(paymentRef, amountCents);
    return res.refundRef;
  }
}
