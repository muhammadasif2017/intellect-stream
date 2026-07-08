import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { OutboxRelayService } from './outbox-relay.service';
import { PUBLISHER } from './publisher.interface';
import { RabbitMqPublisher } from './rabbitmq-publisher.service';

@Module({
  imports: [PrismaModule, ScheduleModule.forRoot()],
  providers: [OutboxRelayService, { provide: PUBLISHER, useClass: RabbitMqPublisher }],
})
export class OutboxModule {}
