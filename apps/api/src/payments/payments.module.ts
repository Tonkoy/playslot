import { forwardRef, Module } from '@nestjs/common';
import type { ServerEnv } from '@playslot/config';
import { SERVER_ENV } from '../config/app-config.module';
import { ReservationsModule } from '../reservations/reservations.module';
import { MockPaymentProvider } from './mock.provider';
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment-provider';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { StripePaymentProvider } from './stripe.provider';

@Module({
  imports: [forwardRef(() => ReservationsModule)],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    {
      provide: PAYMENT_PROVIDER,
      inject: [SERVER_ENV],
      // Stripe when a key is configured; a deterministic mock otherwise (tests/dev).
      useFactory: (env: ServerEnv): PaymentProvider =>
        env.STRIPE_SECRET_KEY ? new StripePaymentProvider(env) : new MockPaymentProvider(),
    },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
