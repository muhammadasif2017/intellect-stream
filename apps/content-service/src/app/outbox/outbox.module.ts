import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { KafkaMessagingModule, SharedMessagingModule } from '@intellect-stream/shared-messaging';
import { PrismaModule } from '../prisma/prisma.module';
import { OutboxRelayService } from './outbox-relay.service';

@Module({
  imports: [
    PrismaModule,
    ScheduleModule.forRoot(),
    SharedMessagingModule,
    KafkaMessagingModule,
  ],
  providers: [OutboxRelayService],
})
export class OutboxModule {}
