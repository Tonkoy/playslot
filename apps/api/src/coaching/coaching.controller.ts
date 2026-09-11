import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import {
  coachAvailabilityQuerySchema,
  updateCoachHoursSchema,
  type UpdateCoachHoursInput,
} from '@playslot/contracts';
import { CurrentUser, Public } from '../auth/decorators';
import { ZodBody } from '../common/zod-validation.pipe';
import { CoachingService } from './coaching.service';

/** Public coach directory + coach-first availability (spec §7/§10/§15). */
@Controller('coaches')
export class CoachingController {
  constructor(private readonly coaching: CoachingService) {}

  /** The signed-in coach's own weekly schedule (authenticated). Declared before
   * the `:id` routes so the static path wins. */
  @Get('me/schedule')
  mySchedule(@CurrentUser('id') userId: number, @Query('from') from?: string) {
    return this.coaching.getMySchedule(userId, from);
  }

  /** The signed-in coach's working hours (read + replace). */
  @Get('me/hours')
  myHours(@CurrentUser('id') userId: number) {
    return this.coaching.getMyHours(userId);
  }

  @Put('me/hours')
  updateHours(
    @CurrentUser('id') userId: number,
    @Body(new ZodBody(updateCoachHoursSchema)) body: UpdateCoachHoursInput,
  ) {
    return this.coaching.updateMyHours(userId, body);
  }

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
