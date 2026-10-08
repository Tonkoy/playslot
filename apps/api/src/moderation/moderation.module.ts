import { Module } from '@nestjs/common';
import { MyStandingController, PlatformUsersController } from './moderation.controller';
import { ModerationService } from './moderation.service';

@Module({
  controllers: [PlatformUsersController, MyStandingController],
  providers: [ModerationService],
})
export class ModerationModule {}
