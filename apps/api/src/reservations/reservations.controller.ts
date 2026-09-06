import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
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
