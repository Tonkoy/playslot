import { Controller, Get, Query } from '@nestjs/common';
import { availabilityQuerySchema } from '@playslot/contracts';
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
}
