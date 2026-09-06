import { forwardRef, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PaymentsModule } from '../payments/payments.module';
import { ClubOpsController } from './club-ops.controller';
import { HoldQueueService } from './hold-queue.service';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';

@Module({
  imports: [AuthModule, forwardRef(() => PaymentsModule)],
  controllers: [ReservationsController, ClubOpsController],
  providers: [ReservationsService, HoldQueueService],
  exports: [ReservationsService],
})
export class ReservationsModule {}
