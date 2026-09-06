import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  blockSchema,
  cancelReservationSchema,
  manualBookingSchema,
  rescheduleSchema,
} from '@playslot/contracts';
import { Role } from '@playslot/db';
import { z } from 'zod';
import { ClubMembershipGuard } from '../auth/club-membership.guard';
import { ClubRoles, CurrentUser } from '../auth/decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ZodBody } from '../common/zod-validation.pipe';
import { ReservationsService } from './reservations.service';

const dateSchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

/**
 * Club Operating System (spec §16). All routes are club-scoped and re-run the
 * same booking/conflict logic as the public engine, so manual and online
 * bookings occupy identical inventory. Every mutation is audit-logged.
 */
@Controller('clubs/:clubId')
@UseGuards(ClubMembershipGuard)
@ClubRoles(Role.CLUB_STAFF, Role.CLUB_ADMIN)
export class ClubOpsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Get('calendar')
  calendar(@Param('clubId') clubId: string, @Query() query: unknown) {
    const { date } = dateSchema.parse(query);
    return this.reservations.getCalendar(Number(clubId), date);
  }

  @Get('customers')
  customers(@Param('clubId') clubId: string) {
    return this.reservations.listCustomers(Number(clubId));
  }

  @Post('reservations')
  manual(
    @Param('clubId') clubId: string,
    @Body(new ZodBody(manualBookingSchema)) body: import('@playslot/contracts').ManualBookingInput,
    @CurrentUser('id') userId: number,
  ) {
    return this.reservations.createManual(Number(clubId), body, userId);
  }

  @Post('blocks')
  block(
    @Param('clubId') clubId: string,
    @Body(new ZodBody(blockSchema)) body: import('@playslot/contracts').BlockInput,
    @CurrentUser('id') userId: number,
  ) {
    return this.reservations.createBlock(Number(clubId), body, userId);
  }

  @Patch('reservations/:id')
  reschedule(
    @Param('clubId') clubId: string,
    @Param('id') id: string,
    @Body(new ZodBody(rescheduleSchema)) body: import('@playslot/contracts').RescheduleInput,
    @CurrentUser('id') userId: number,
  ) {
    return this.reservations.reschedule(Number(clubId), Number(id), body, userId);
  }

  @Post('reservations/:id/cancel')
  @HttpCode(200)
  cancel(
    @Param('id') id: string,
    @Body(new ZodBody(cancelReservationSchema)) body: { reason?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reservations.cancel(Number(id), user.id, user.roles, body.reason);
  }

  @Post('reservations/:id/mark-paid')
  @HttpCode(200)
  markPaid(
    @Param('clubId') clubId: string,
    @Param('id') id: string,
    @CurrentUser('id') userId: number,
  ) {
    return this.reservations.markPaid(Number(clubId), Number(id), userId);
  }

  @Post('reservations/:id/no-show')
  @HttpCode(200)
  noShow(
    @Param('clubId') clubId: string,
    @Param('id') id: string,
    @CurrentUser('id') userId: number,
  ) {
    return this.reservations.markNoShow(Number(clubId), Number(id), userId);
  }
}
