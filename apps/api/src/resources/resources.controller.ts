import { Body, Controller, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { availabilityRuleSchema, upsertCourtSchema } from '@playslot/contracts';
import { Role } from '@playslot/db';
import { ZodBody } from '../common/zod-validation.pipe';
import { ClubMembershipGuard } from '../auth/club-membership.guard';
import { ClubRoles, CurrentUser } from '../auth/decorators';
import { ResourcesService } from './resources.service';

const availabilityListSchema = z.object({ rules: z.array(availabilityRuleSchema).max(100) });
const statusSchema = z.object({ status: z.enum(['ACTIVE', 'INACTIVE']) });

/**
 * Club-scoped court administration (spec §13). Every route runs the
 * ClubMembershipGuard, so access is decided server-side against membership.
 * CLUB_STAFF may read; CLUB_ADMIN may modify.
 */
@Controller('clubs/:clubId/resources')
@UseGuards(ClubMembershipGuard)
export class ResourcesController {
  constructor(private readonly resources: ResourcesService) {}

  @Get()
  @ClubRoles(Role.CLUB_STAFF, Role.CLUB_ADMIN)
  list(@Param('clubId') clubId: string) {
    return this.resources.listCourts(Number(clubId));
  }

  @Post()
  @ClubRoles(Role.CLUB_ADMIN)
  create(
    @Param('clubId') clubId: string,
    @Body(new ZodBody(upsertCourtSchema)) body: import('@playslot/contracts').UpsertCourtInput,
    @CurrentUser('id') userId: number,
  ) {
    return this.resources.createCourt(Number(clubId), body, userId);
  }

  @Patch(':courtId')
  @ClubRoles(Role.CLUB_ADMIN)
  update(
    @Param('clubId') clubId: string,
    @Param('courtId') courtId: string,
    @Body(new ZodBody(upsertCourtSchema)) body: import('@playslot/contracts').UpsertCourtInput,
    @CurrentUser('id') userId: number,
  ) {
    return this.resources.updateCourt(Number(clubId), Number(courtId), body, userId);
  }

  @Patch(':courtId/status')
  @ClubRoles(Role.CLUB_ADMIN)
  setStatus(
    @Param('clubId') clubId: string,
    @Param('courtId') courtId: string,
    @Body(new ZodBody(statusSchema)) body: { status: 'ACTIVE' | 'INACTIVE' },
    @CurrentUser('id') userId: number,
  ) {
    return this.resources.setCourtStatus(Number(clubId), Number(courtId), body.status, userId);
  }

  @Get(':courtId/availability')
  @ClubRoles(Role.CLUB_STAFF, Role.CLUB_ADMIN)
  getAvailability(@Param('clubId') clubId: string, @Param('courtId') courtId: string) {
    return this.resources.getAvailability(Number(clubId), Number(courtId));
  }

  @Put(':courtId/availability')
  @ClubRoles(Role.CLUB_ADMIN)
  setAvailability(
    @Param('clubId') clubId: string,
    @Param('courtId') courtId: string,
    @Body(new ZodBody(availabilityListSchema))
    body: { rules: import('@playslot/contracts').AvailabilityRuleInput[] },
    @CurrentUser('id') userId: number,
  ) {
    return this.resources.setAvailability(Number(clubId), Number(courtId), body.rules, userId);
  }
}
