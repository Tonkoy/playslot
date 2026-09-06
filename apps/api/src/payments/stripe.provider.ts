import type { ServerEnv } from '@playslot/config';
import Stripe from 'stripe';
import {
  type CheckoutParams,
  type CheckoutResult,
  type PaymentProvider,
  type PaymentWebhookEvent,
  type RefundResult,
} from './payment-provider';

/**
 * Stripe adapter (spec §17): hosted Checkout (card data never touches us),
 * cryptographically verified webhooks, and refunds against the PaymentIntent.
 */
export class StripePaymentProvider implements PaymentProvider {
  readonly name = 'stripe';
  private readonly stripe: Stripe;

  constructor(private readonly env: ServerEnv) {
    this.stripe = new Stripe(env.STRIPE_SECRET_KEY!); // SDK's pinned API version
  }

  isConfigured(): boolean {
    return Boolean(this.env.STRIPE_SECRET_KEY);
  }

  async createCheckout(params: CheckoutParams): Promise<CheckoutResult> {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: params.currency.toLowerCase(),
            unit_amount: params.amountCents,
            product_data: { name: params.description },
          },
        },
      ],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      customer_email: params.customerEmail,
      client_reference_id: String(params.reservationId),
      metadata: { reservationId: String(params.reservationId) },
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // 30 min
    });
    return { url: session.url!, sessionRef: session.id };
  }

  parseWebhook(rawBody: Buffer | string, signature: string): PaymentWebhookEvent {
    const event = this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      this.env.STRIPE_WEBHOOK_SECRET!,
    );
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object as Stripe.Checkout.Session;
        const reservationId = Number(s.metadata?.reservationId ?? s.client_reference_id);
        if (s.payment_status !== 'paid' || !reservationId) return { kind: 'ignored' };
        const paymentRef =
          typeof s.payment_intent === 'string' ? s.payment_intent : (s.payment_intent?.id ?? s.id);
        return { kind: 'paid', reservationId, paymentRef };
      }
      case 'checkout.session.expired':
      case 'checkout.session.async_payment_failed': {
        const s = event.data.object as Stripe.Checkout.Session;
        const reservationId = Number(s.metadata?.reservationId ?? s.client_reference_id);
        return reservationId ? { kind: 'failed', reservationId } : { kind: 'ignored' };
      }
      default:
        return { kind: 'ignored' };
    }
  }

  async refund(paymentRef: string, amountCents: number): Promise<RefundResult> {
    const refund = await this.stripe.refunds.create({
      payment_intent: paymentRef,
      amount: amountCents,
    });
    return { refundRef: refund.id };
  }
}
