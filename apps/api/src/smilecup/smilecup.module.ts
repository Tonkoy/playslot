import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReservationsModule } from '../reservations/reservations.module';
import { SmileCupController } from './smilecup.controller';
import { SmileCupService } from './smilecup.service';

@Module({
  imports: [AuthModule, ReservationsModule],
  controllers: [SmileCupController],
  providers: [SmileCupService],
})
export class SmileCupModule {}
