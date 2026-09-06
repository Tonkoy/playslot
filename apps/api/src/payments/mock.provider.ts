import {
  type CheckoutParams,
  type CheckoutResult,
  type PaymentProvider,
  type PaymentWebhookEvent,
  type RefundResult,
} from './payment-provider';

/**
 * Deterministic in-memory provider for tests and for running without a Stripe
 * key. Webhooks are posted as the already-normalized event JSON, so the full
 * PENDING_PAYMENT → CONFIRMED / CANCELLED flow is exercised end-to-end without
 * a real PSP.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';

  isConfigured(): boolean {
    return true;
  }

  async createCheckout(params: CheckoutParams): Promise<CheckoutResult> {
    return {
      url: `https://mock-checkout.playslot.local/pay/${params.reservationId}`,
      sessionRef: `cs_mock_${params.reservationId}`,
    };
  }

  parseWebhook(rawBody: Buffer | string): PaymentWebhookEvent {
    const parsed = JSON.parse(rawBody.toString()) as PaymentWebhookEvent;
    return parsed;
  }

  async refund(paymentRef: string, _amountCents: number): Promise<RefundResult> {
    return { refundRef: `re_mock_${paymentRef}` };
  }
}
