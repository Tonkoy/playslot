import { Module } from '@nestjs/common';
import { ClubStatsController, PlatformStatsController } from './stats.controller';
import { StatsService } from './stats.service';

@Module({
  controllers: [PlatformStatsController, ClubStatsController],
  providers: [StatsService],
})
export class StatsModule {}
