import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DevController } from './dev.controller';
import { DevStatsService } from './dev-stats.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [DevController],
  providers: [DevStatsService],
})
export class DevModule {}
