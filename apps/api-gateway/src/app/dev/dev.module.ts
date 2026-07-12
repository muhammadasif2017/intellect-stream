import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DevController } from './dev.controller';
import { DevLogsService } from './dev-logs.service';
import { DevStatusService } from './dev-status.service';

@Module({
  imports: [AuthModule],
  controllers: [DevController],
  providers: [DevStatusService, DevLogsService],
})
export class DevModule {}
