import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { InternalAuthGuard } from '../auth/internal-auth.guard';
import { TrendsService } from './trends.service';

const DEFAULT_DAYS = 14;
const MAX_DAYS = 90;

// Read side of the ADR-0010 read-model. Internal-token guarded like every
// cross-service call — the dashboard reaches it through the gateway proxy.
@Controller('trends')
@UseGuards(InternalAuthGuard)
export class TrendsController {
  constructor(private readonly trends: TrendsService) {}

  @Get()
  find(@Query('days') days?: string) {
    const parsed = Number(days);
    const clamped =
      Number.isFinite(parsed) && parsed > 0
        ? Math.min(parsed, MAX_DAYS)
        : DEFAULT_DAYS;
    return this.trends.trendsSince(clamped);
  }
}
