import { Controller, Get, Param, Query } from '@nestjs/common';
import { coachAvailabilityQuerySchema } from '@playslot/contracts';
import { Public } from '../auth/decorators';
import { CoachingService } from './coaching.service';

/** Public coach directory + coach-first availability (spec §7/§10/§15). */
@Controller('coaches')
export class CoachingController {
  constructor(private readonly coaching: CoachingService) {}

  @Public()
  @Get()
  list(@Query('clubId') clubId?: string) {
    return this.coaching.listCoaches(clubId ? Number(clubId) : undefined);
  }

  @Public()
  @Get(':id')
  get(@Param('id') id: string) {
    return this.coaching.getCoach(Number(id));
  }

  @Public()
  @Get(':id/availability')
  availability(@Param('id') id: string, @Query() query: unknown) {
    const parsed = coachAvailabilityQuerySchema.parse(query);
    return this.coaching.getCoachAvailability(Number(id), parsed);
  }
}
