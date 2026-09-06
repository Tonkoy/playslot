import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { upsertEventSchema } from '@playslot/contracts';
import { Role } from '@playslot/db';
import { ClubMembershipGuard } from '../auth/club-membership.guard';
import { ClubRoles, CurrentUser, Public } from '../auth/decorators';
import { ZodBody } from '../common/zod-validation.pipe';
import { ProgramsService } from './programs.service';

@Controller()
export class ProgramsController {
  constructor(private readonly programs: ProgramsService) {}

  @Public()
  @Get('events')
  list(@Query('clubId') clubId?: string, @CurrentUser('id') userId?: number) {
    return this.programs.list(clubId ? Number(clubId) : undefined, userId);
  }

  @Public()
  @Get('events/:id')
  get(@Param('id') id: string, @CurrentUser('id') userId?: number) {
    return this.programs.getOne(Number(id), userId);
  }

  @Post('events/:id/register')
  @HttpCode(200)
  register(@Param('id') id: string, @CurrentUser('id') userId: number) {
    return this.programs.register(Number(id), userId);
  }

  @Delete('events/:id/register')
  unregister(@Param('id') id: string, @CurrentUser('id') userId: number) {
    return this.programs.unregister(Number(id), userId);
  }

  // ── admin ──
  @Post('clubs/:clubId/events')
  @UseGuards(ClubMembershipGuard)
  @ClubRoles(Role.CLUB_STAFF, Role.CLUB_ADMIN)
  create(
    @Param('clubId') clubId: string,
    @Body(new ZodBody(upsertEventSchema)) body: import('@playslot/contracts').UpsertEventInput,
  ) {
    return this.programs.create(Number(clubId), body);
  }

  @Patch('clubs/:clubId/events/:eventId')
  @UseGuards(ClubMembershipGuard)
  @ClubRoles(Role.CLUB_STAFF, Role.CLUB_ADMIN)
  update(
    @Param('clubId') clubId: string,
    @Param('eventId') eventId: string,
    @Body(new ZodBody(upsertEventSchema)) body: import('@playslot/contracts').UpsertEventInput,
  ) {
    return this.programs.update(Number(clubId), Number(eventId), body);
  }
}
