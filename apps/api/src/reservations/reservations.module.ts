import { forwardRef, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GameNotifierModule } from '../group-sessions/game-notifier';
import { MembershipsModule } from '../memberships/memberships.module';
import { PaymentsModule } from '../payments/payments.module';
import { PushModule } from '../push/push.module';
import { ClubOpsController } from './club-ops.controller';
import { CoachScheduleService } from './coach-schedule.service';
import { HoldQueueService } from './hold-queue.service';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';

@Module({
  imports: [AuthModule, MembershipsModule, PushModule, GameNotifierModule, forwardRef(() => PaymentsModule)],
  controllers: [ReservationsController, ClubOpsController],
  providers: [ReservationsService, HoldQueueService, CoachScheduleService],
  exports: [ReservationsService, CoachScheduleService],
})
export class ReservationsModule {}
