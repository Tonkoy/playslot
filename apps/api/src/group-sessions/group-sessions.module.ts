import { Module } from '@nestjs/common';
import { ReservationsModule } from '../reservations/reservations.module';
import { GameNotifierModule } from './game-notifier';
import { GroupSessionsController } from './group-sessions.controller';
import { GroupSessionsService } from './group-sessions.service';

@Module({
  imports: [ReservationsModule, GameNotifierModule],
  controllers: [GroupSessionsController],
  providers: [GroupSessionsService],
})
export class GroupSessionsModule {}
