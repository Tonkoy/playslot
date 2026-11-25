import { Body, Controller, Get, HttpCode, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { cancelReservationSchema, createReservationSchema } from '@playslot/contracts';
import { CurrentUser } from '../auth/decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ZodBody } from '../common/zod-validation.pipe';
import { ReservationsService } from './reservations.service';

@Controller()
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Post('reservations')
  create(
    @Body(new ZodBody(createReservationSchema))
    body: import('@playslot/contracts').CreateReservationInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reservations.createReservation(
      body,
      { userId: user.id, emailVerified: user.emailVerified },
      'WEB',
    );
  }

  @Get('me/reservations')
  listMine(@CurrentUser('id') userId: number) {
    return this.reservations.listMine(userId);
  }

  @Get('reservations/:id')
  getOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.reservations.getOne(Number(id), user.id, user.roles);
  }

  /** The booking as a calendar file (.ics) — opens in the phone's calendar app. */
  @Get('reservations/:id/calendar.ics')
  async calendar(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Res() res: Response) {
    const file = await this.reservations.calendarFile(Number(id), user.id, user.roles);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    // inline: iPhone Safari offers "Add to Calendar" instead of saving a file.
    res.setHeader('Content-Disposition', `inline; filename="${file.filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(file.body);
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
}
