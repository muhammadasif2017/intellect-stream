import { Module } from '@nestjs/common';
import { SharedMessagingModule } from '@intellect-stream/shared-messaging';
import { CfWorkersAiService } from './cf-workers-ai.service';
import { ModerationConsumerService } from './moderation-consumer.service';

@Module({
  imports: [SharedMessagingModule],
  providers: [CfWorkersAiService, ModerationConsumerService],
})
export class ModerationModule {}
