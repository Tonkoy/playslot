import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CitiesController } from './cities.controller';
import { ClubsController } from './clubs.controller';
import { ClubsService } from './clubs.service';
import { MeController } from './me.controller';
import { PlatformController } from './platform.controller';
import { TeamController } from './team.controller';

@Module({
  imports: [AuthModule],
  controllers: [ClubsController, PlatformController, MeController, TeamController, CitiesController],
  providers: [ClubsService],
  exports: [ClubsService],
})
export class ClubsModule {}
