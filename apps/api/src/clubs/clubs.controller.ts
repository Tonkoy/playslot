import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  clubJoinRequestSchema,
  clubSettingsSchema,
  createClubClosureSchema,
  deleteClubClosureSchema,
  updateClubProfileSchema,
  upsertClubSchema,
} from '@playslot/contracts';
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

  // Must stay registered before ":id" — "featured" would otherwise be parsed
  // as an id.
  @Public()
  @Get('featured')
  featured() {
    return this.clubs.getFeaturedForHome();
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

  @Patch(':clubId/profile')
  @UseGuards(ClubMembershipGuard)
  @ClubRoles(Role.CLUB_ADMIN)
  updateProfile(
    @Param('clubId') clubId: string,
    @Body(new ZodBody(updateClubProfileSchema)) body: import('@playslot/contracts').UpdateClubProfileInput,
    @CurrentUser('id') userId: number,
  ) {
    return this.clubs.updateClubProfile(Number(clubId), body, userId);
  }

  // ── special days: club closures / downtime ──
  @Get(':clubId/closures')
  @UseGuards(ClubMembershipGuard)
  @ClubRoles(Role.CLUB_STAFF, Role.CLUB_ADMIN)
  listClosures(@Param('clubId') clubId: string) {
    return this.clubs.listClosures(Number(clubId));
  }

  @Post(':clubId/closures')
  @UseGuards(ClubMembershipGuard)
  @ClubRoles(Role.CLUB_ADMIN)
  createClosure(
    @Param('clubId') clubId: string,
    @Body(new ZodBody(createClubClosureSchema)) body: import('@playslot/contracts').CreateClubClosureInput,
    @CurrentUser('id') userId: number,
  ) {
    return this.clubs.createClosure(Number(clubId), body, userId);
  }

  @Delete(':clubId/closures')
  @UseGuards(ClubMembershipGuard)
  @ClubRoles(Role.CLUB_ADMIN)
  deleteClosure(
    @Param('clubId') clubId: string,
    @Body(new ZodBody(deleteClubClosureSchema)) body: import('@playslot/contracts').DeleteClubClosureInput,
    @CurrentUser('id') userId: number,
  ) {
    return this.clubs.deleteClosure(Number(clubId), body.startsAt, body.endsAt, userId);
  }

  @Patch(':clubId/settings')
  @UseGuards(ClubMembershipGuard)
  @ClubRoles(Role.CLUB_ADMIN)
  updateSettings(
    @Param('clubId') clubId: string,
    @Body(new ZodBody(clubSettingsSchema)) body: import('@playslot/contracts').ClubSettingsInput,
    @CurrentUser('id') userId: number,
  ) {
    return this.clubs.updateSettings(Number(clubId), body, userId);
  }
}
