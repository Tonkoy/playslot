import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  deleteUserSchema,
  reinstateUserSchema,
  suspendUserSchema,
  type DeleteUserInput,
  type ReinstateUserInput,
  type SuspendUserInput,
} from '@playslot/contracts';
import { Role } from '@playslot/db';
import { CurrentUser, Roles } from '../auth/decorators';
import { ZodBody } from '../common/zod-validation.pipe';
import { ModerationService } from './moderation.service';

/** Platform-admin user moderation. */
@Controller('platform/users')
@Roles(Role.PLATFORM_ADMIN)
export class PlatformUsersController {
  constructor(private readonly moderation: ModerationService) {}

  @Get()
  list(@Query('q') q?: string, @Query('suspended') suspended?: string) {
    return this.moderation.list(q, suspended === '1' || suspended === 'true');
  }

  @Post(':id/suspend')
  @HttpCode(200)
  suspend(
    @Param('id') id: string,
    @Body(new ZodBody(suspendUserSchema)) body: SuspendUserInput,
    @CurrentUser('id') actorId: number,
  ) {
    return this.moderation.suspend(Number(id), body, actorId);
  }

  @Post(':id/reinstate')
  @HttpCode(200)
  reinstate(
    @Param('id') id: string,
    @Body(new ZodBody(reinstateUserSchema)) body: ReinstateUserInput,
    @CurrentUser('id') actorId: number,
  ) {
    return this.moderation.reinstate(Number(id), body, actorId);
  }

  /** Manually approve a registration (mark the email as verified) — no email round-trip. */
  @Post(':id/verify-email')
  @HttpCode(200)
  verifyEmail(@Param('id') id: string, @CurrentUser('id') actorId: number) {
    return this.moderation.verifyEmail(Number(id), actorId);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @Body(new ZodBody(deleteUserSchema)) body: DeleteUserInput,
    @CurrentUser('id') actorId: number,
  ) {
    return this.moderation.remove(Number(id), body ?? {}, actorId);
  }
}

/** The signed-in user's own standing (restricted-account banner). */
@Controller('me/standing')
export class MyStandingController {
  constructor(private readonly moderation: ModerationService) {}

  @Get()
  get(@CurrentUser('id') userId: number) {
    return this.moderation.standing(userId);
  }
}
