import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DevController } from './dev.controller';
import { DevStatusService } from './dev-status.service';

@Module({
  imports: [AuthModule],
  controllers: [DevController],
  providers: [DevStatusService],
})
export class DevModule {}
