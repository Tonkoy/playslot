import { Module } from '@nestjs/common';
import { HoldQueueService } from './hold-queue.service';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';

@Module({
  controllers: [ReservationsController],
  providers: [ReservationsService, HoldQueueService],
  exports: [ReservationsService],
})
export class ReservationsModule {}
