import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { clubJoinRequestSchema, upsertClubSchema } from '@playslot/contracts';
import { Role } from '@playslot/db';
import { ZodBody } from '../common/zod-validation.pipe';
import { ClubMembershipGuard } from '../auth/club-membership.guard';
import { ClubRoles, CurrentUser, Public } from '../auth/decorators';
import { ClubsService } from './clubs.service';

@Controller('clubs')
export class ClubsController {
  constructor(private readonly clubs: ClubsService) {}

  @Public()
  @Get()
  list() {
    return this.clubs.listPublic();
  }

  @Public()
  @Post('join-request')
  joinRequest(
    @Body(new ZodBody(clubJoinRequestSchema)) body: import('@playslot/contracts').ClubJoinRequestInput,
  ) {
    return this.clubs.joinRequest(body);
  }

  @Public()
  @Get(':id')
  get(@Param('id') id: string) {
    return this.clubs.getPublic(id);
  }

  @Public()
  @Get(':id/courts')
  courts(@Param('id') id: string) {
    return this.clubs.getCourtsPublic(id);
  }

  @Public()
  @Get(':id/coaches')
  coaches(@Param('id') id: string) {
    return this.clubs.getCoachesPublic(id);
  }

  // ── admin: edit own club ──
  @Patch(':clubId')
  @UseGuards(ClubMembershipGuard)
  @ClubRoles(Role.CLUB_ADMIN)
  update(
    @Param('clubId') clubId: string,
    @Body(new ZodBody(upsertClubSchema)) body: import('@playslot/contracts').UpsertClubInput,
    @CurrentUser('id') userId: number,
  ) {
    return this.clubs.updateClub(Number(clubId), body, userId);
  }
}
