import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { feedbackInputSchema, type FeedbackInput } from '@playslot/contracts';
import { Role } from '@playslot/db';
import { ClubMembershipGuard } from '../auth/club-membership.guard';
import { ClubRoles, CurrentUser } from '../auth/decorators';
import { ZodBody } from '../common/zod-validation.pipe';
import { FeedbackService } from './feedback.service';

/** Player feedback on attended sessions (authenticated). */
@Controller('me/feedback')
export class MyFeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Get()
  list(@CurrentUser('id') userId: number) {
    return this.feedback.listMine(userId);
  }

  @Post()
  @HttpCode(200)
  submit(@Body(new ZodBody(feedbackInputSchema)) body: FeedbackInput, @CurrentUser('id') userId: number) {
    return this.feedback.submit(userId, body);
  }
}

/** The club's own view of that feedback (staff read-only). */
@Controller('clubs/:clubId/feedback')
@UseGuards(ClubMembershipGuard)
export class ClubFeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Get()
  @ClubRoles(Role.CLUB_STAFF, Role.CLUB_ADMIN)
  list(@Param('clubId') clubId: string) {
    return this.feedback.listForClub(Number(clubId));
  }
}
