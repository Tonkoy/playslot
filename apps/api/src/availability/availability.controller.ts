import { Controller, Get, Query } from '@nestjs/common';
import { availabilityQuerySchema, availabilitySummaryQuerySchema } from '@playslot/contracts';
import { CurrentUser, Public } from '../auth/decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AvailabilityService } from './availability.service';

/**
 * Public availability grid data (spec §13). Optional auth: when a valid session
 * is present the caller's own reservations are marked MINE. Read-only, computed
 * on demand — slots are never stored (spec §5).
 */
@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  @Public()
  @Get()
  get(@Query() query: unknown, @CurrentUser() user?: AuthenticatedUser) {
    const parsed = availabilityQuerySchema.parse(query);
    return this.availability.getAvailability(parsed, user?.id);
  }

  /**
   * How many slots are free on each of the next days — the numbers under the
   * day strip above the grid. One request instead of one per day, so a club
   * page costs the same number of calls however many days it shows.
   */
  @Public()
  @Get('summary')
  summary(@Query() query: unknown) {
    return this.availability.getSummary(availabilitySummaryQuerySchema.parse(query));
  }
}
