import { Module } from '@nestjs/common';
import { KafkaMessagingModule } from '@intellect-stream/shared-messaging';
import { AuthModule } from '../auth/auth.module';
import { RegistryModule } from '../registry/registry.module';
import { NotificationsGateway } from './notifications.gateway';
import { ModerationPushService } from './moderation-push.service';

@Module({
  imports: [
    AuthModule,
    RegistryModule,
    KafkaMessagingModule.forRoot({ clientId: 'notification-service' }),
  ],
  providers: [NotificationsGateway, ModerationPushService],
})
export class NotificationsModule {}
