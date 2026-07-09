import { Module } from '@nestjs/common';
import { KafkaMessagingModule } from '@intellect-stream/shared-messaging';
import { PrismaModule } from '../prisma/prisma.module';
import { TrendsService } from './trends.service';

@Module({
  imports: [PrismaModule, KafkaMessagingModule.forRoot({ clientId: 'analytics-service' })],
  providers: [TrendsService],
})
export class TrendsModule {}
