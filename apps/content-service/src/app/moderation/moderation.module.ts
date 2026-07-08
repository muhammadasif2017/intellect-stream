import { Module } from '@nestjs/common';
import { SharedMessagingModule } from '@intellect-stream/shared-messaging';
import { PrismaModule } from '../prisma/prisma.module';
import { ModerationCompletedConsumerService } from './moderation-completed-consumer.service';

@Module({
  imports: [SharedMessagingModule, PrismaModule],
  providers: [ModerationCompletedConsumerService],
})
export class ModerationModule {}
