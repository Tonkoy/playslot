import { Body, Controller, Delete, Get, Post } from '@nestjs/common';
import {
  pushSubscribeSchema,
  pushUnsubscribeSchema,
  type PushSubscribeInput,
  type PushUnsubscribeInput,
} from '@playslot/contracts';
import { CurrentUser } from '../auth/decorators';
import { ZodBody } from '../common/zod-validation.pipe';
import { PushService } from './push.service';

/** Browser push subscriptions for the signed-in user. */
@Controller('me/push')
export class PushController {
  constructor(private readonly push: PushService) {}

  /** VAPID public key + how many browsers this user has subscribed. */
  @Get()
  config(@CurrentUser('id') userId: number) {
    return this.push.config(userId);
  }

  @Post()
  async subscribe(
    @CurrentUser('id') userId: number,
    @Body(new ZodBody(pushSubscribeSchema)) body: PushSubscribeInput,
  ) {
    await this.push.subscribe(userId, body);
    return { ok: true };
  }

  @Delete()
  async unsubscribe(
    @CurrentUser('id') userId: number,
    @Body(new ZodBody(pushUnsubscribeSchema)) body: PushUnsubscribeInput,
  ) {
    await this.push.unsubscribe(userId, body.endpoint);
    return { ok: true };
  }
}
