import { Body, Controller, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { grantMembershipSchema, upsertMembershipPlanSchema } from '@playslot/contracts';
import { Role } from '@playslot/db';
import { ClubMembershipGuard } from '../auth/club-membership.guard';
import { ClubRoles, CurrentUser, Public } from '../auth/decorators';
import { ZodBody } from '../common/zod-validation.pipe';
import { MembershipsService } from './memberships.service';

@Controller()
export class MembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  @Public()
  @Get('clubs/:id/membership-plans')
  publicPlans(@Param('id') id: string) {
    return this.memberships.listPlans(Number(id), true);
  }

  @Get('me/memberships')
  mine(@CurrentUser('id') userId: number) {
    return this.memberships.listMine(userId);
  }

  @Post('clubs/:clubId/membership-plans')
  @UseGuards(ClubMembershipGuard)
  @ClubRoles(Role.CLUB_ADMIN)
  createPlan(
    @Param('clubId') clubId: string,
    @Body(new ZodBody(upsertMembershipPlanSchema))
    body: import('@playslot/contracts').UpsertMembershipPlanInput,
  ) {
    return this.memberships.createPlan(Number(clubId), body);
  }

  @Patch('clubs/:clubId/membership-plans/:planId')
  @UseGuards(ClubMembershipGuard)
  @ClubRoles(Role.CLUB_ADMIN)
  updatePlan(
    @Param('clubId') clubId: string,
    @Param('planId') planId: string,
    @Body(new ZodBody(upsertMembershipPlanSchema))
    body: import('@playslot/contracts').UpsertMembershipPlanInput,
  ) {
    return this.memberships.updatePlan(Number(clubId), Number(planId), body);
  }

  @Post('clubs/:clubId/memberships')
  @HttpCode(200)
  @UseGuards(ClubMembershipGuard)
  @ClubRoles(Role.CLUB_STAFF, Role.CLUB_ADMIN)
  grant(
    @Param('clubId') clubId: string,
    @Body(new ZodBody(grantMembershipSchema)) body: { userEmail: string; planId: number },
  ) {
    return this.memberships.grant(Number(clubId), body.userEmail, body.planId);
  }
}
