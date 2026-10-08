import { Module } from '@nestjs/common';
import { PushController } from './push.controller';
import { PushService } from './push.service';

@Module({
  controllers: [PushController],
  providers: [PushService],
  // Exported so reservation/booking flows can send notifications later.
  exports: [PushService],
})
export class PushModule {}
