import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RegistryModule } from '../registry/registry.module';
import { NotificationsGateway } from './notifications.gateway';

@Module({
  imports: [AuthModule, RegistryModule],
  providers: [NotificationsGateway],
})
export class NotificationsModule {}
