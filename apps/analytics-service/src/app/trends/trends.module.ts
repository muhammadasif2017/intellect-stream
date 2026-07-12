import { Module } from '@nestjs/common';
import { KafkaMessagingModule } from '@intellect-stream/shared-messaging';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TrendsController } from './trends.controller';
import { TrendsService } from './trends.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    KafkaMessagingModule.forRoot({ clientId: 'analytics-service' }),
  ],
  controllers: [TrendsController],
  providers: [TrendsService],
})
export class TrendsModule {}
