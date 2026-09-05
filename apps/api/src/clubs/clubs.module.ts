import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClubsController } from './clubs.controller';
import { ClubsService } from './clubs.service';
import { MeController } from './me.controller';
import { PlatformController } from './platform.controller';

@Module({
  imports: [AuthModule],
  controllers: [ClubsController, PlatformController, MeController],
  providers: [ClubsService],
  exports: [ClubsService],
})
export class ClubsModule {}
