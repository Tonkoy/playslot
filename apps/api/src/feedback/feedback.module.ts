import { Module } from '@nestjs/common';
import { ClubFeedbackController, MyFeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';

@Module({
  controllers: [MyFeedbackController, ClubFeedbackController],
  providers: [FeedbackService],
})
export class FeedbackModule {}
