import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { addMemberSchema, type AddMemberInput } from '@playslot/contracts';
import { Role } from '@playslot/db';
import { ClubMembershipGuard } from '../auth/club-membership.guard';
import { ClubRoles, CurrentUser } from '../auth/decorators';
import { ZodBody } from '../common/zod-validation.pipe';
import { ClubsService } from './clubs.service';

/** Club-admin management of the club's team: coaches and staff (spec §13/§16). */
@Controller('clubs/:clubId')
@UseGuards(ClubMembershipGuard)
@ClubRoles(Role.CLUB_ADMIN)
export class TeamController {
  constructor(private readonly clubs: ClubsService) {}

  @Get('team')
  team(@Param('clubId') clubId: string) {
    return this.clubs.getTeam(Number(clubId));
  }

  @Post('coaches')
  @HttpCode(200)
  addCoach(
    @Param('clubId') clubId: string,
    @Body(new ZodBody(addMemberSchema)) body: AddMemberInput,
    @CurrentUser('id') userId: number,
  ) {
    return this.clubs.addCoach(Number(clubId), body, userId);
  }

  @Post('staff')
  @HttpCode(200)
  addStaff(
    @Param('clubId') clubId: string,
    @Body(new ZodBody(addMemberSchema)) body: AddMemberInput,
    @CurrentUser('id') userId: number,
  ) {
    return this.clubs.addStaff(Number(clubId), body, userId);
  }
}
