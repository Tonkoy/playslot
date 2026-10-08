import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { statsQuerySchema } from '@playslot/contracts';
import { Role } from '@playslot/db';
import { ClubMembershipGuard } from '../auth/club-membership.guard';
import { ClubRoles, Roles } from '../auth/decorators';
import { StatsService } from './stats.service';

/** Whole-platform summary (optionally one club). */
@Controller('platform/stats')
@Roles(Role.PLATFORM_ADMIN)
export class PlatformStatsController {
  constructor(private readonly stats: StatsService) {}

  @Get()
  get(@Query() query: Record<string, string>) {
    return this.stats.summary(statsQuerySchema.parse(query), 'platform');
  }
}

/** The same summary scoped to one club, for that club's admins. */
@Controller('clubs/:clubId/stats')
@UseGuards(ClubMembershipGuard)
export class ClubStatsController {
  constructor(private readonly stats: StatsService) {}

  @Get()
  @ClubRoles(Role.CLUB_ADMIN)
  get(@Param('clubId') clubId: string, @Query() query: Record<string, string>) {
    const parsed = statsQuerySchema.parse(query);
    return this.stats.summary({ ...parsed, clubId: Number(clubId) }, 'club');
  }
}
