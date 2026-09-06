/**
 * Payment provider adapter (spec §17). Provider refs stay out of the core
 * reservation rules; Stripe is one implementation behind this interface, and a
 * mock is used in tests / when no key is configured. myPOS/MultiSport could be
 * added later as further adapters.
 */

export interface CheckoutParams {
  reservationId: number;
  amountCents: number;
  currency: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
}

export interface CheckoutResult {
  /** Hosted checkout URL to redirect the customer to. */
  url: string;
  /** Provider reference for the checkout session. */
  sessionRef: string;
}

export type PaymentWebhookEvent =
  | { kind: 'paid'; reservationId: number; paymentRef: string }
  | { kind: 'failed'; reservationId: number }
  | { kind: 'ignored' };

export interface RefundResult {
  refundRef: string;
}

export interface PaymentProvider {
  readonly name: string;
  isConfigured(): boolean;
  createCheckout(params: CheckoutParams): Promise<CheckoutResult>;
  /** Verify signature + parse a webhook into a normalized event. Throws on bad signature. */
  parseWebhook(rawBody: Buffer | string, signature: string): PaymentWebhookEvent;
  /** Refund (full or partial) against a captured payment reference. */
  refund(paymentRef: string, amountCents: number): Promise<RefundResult>;
}

export const PAYMENT_PROVIDER = 'PAYMENT_PROVIDER';
