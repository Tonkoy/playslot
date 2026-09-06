import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClubOpsController } from './club-ops.controller';
import { HoldQueueService } from './hold-queue.service';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';

@Module({
  imports: [AuthModule],
  controllers: [ReservationsController, ClubOpsController],
  providers: [ReservationsService, HoldQueueService],
  exports: [ReservationsService],
})
export class ReservationsModule {}
