import {
  Controller,
  Get,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InternalAuthGuard } from '../auth/internal-auth.guard';
import { DevStatsService } from './dev-stats.service';

// Dev-only introspection for the pipeline dashboard. Double-gated:
// InternalAuthGuard (same gateway-minted token as every internal call) and
// DEV_ENDPOINTS_ENABLED — disabled deployments 404 as if the route
// doesn't exist, because for them it doesn't.
@Controller('dev')
@UseGuards(InternalAuthGuard)
export class DevController {
  constructor(
    private readonly stats: DevStatsService,
    private readonly config: ConfigService,
  ) {}

  @Get('outbox-stats')
  async outboxStats() {
    if (!this.config.get<boolean>('DEV_ENDPOINTS_ENABLED')) {
      throw new NotFoundException();
    }
    return this.stats.outboxStats();
  }
}
