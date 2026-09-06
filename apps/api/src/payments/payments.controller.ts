import { Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/decorators';
import { PaymentsService } from './payments.service';

/** Payment provider webhooks (spec §17): signature-verified + idempotent. */
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Public()
  @HttpCode(200)
  @Post('webhooks/stripe')
  webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ) {
    // rawBody is captured by NestFactory({ rawBody: true }) for signature checks.
    return this.payments.handleWebhook(req.rawBody, signature);
  }
}
