import {
  Controller,
  Get,
  NotFoundException,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Observable } from 'rxjs';
import { SessionGuard } from '../auth/session.guard';
import { DevLogsService } from './dev-logs.service';
import { DevStatusService } from './dev-status.service';

// Dashboard-only introspection. Double-gated: SessionGuard (the dashboard
// logs in like any client) and DEV_ENDPOINTS_ENABLED — disabled deployments
// 404 as if the route doesn't exist. Closes the M2 deferral noted in
// docs/plan/pipeline-dashboard.md.
@Controller('dev')
@UseGuards(SessionGuard)
export class DevController {
  constructor(
    private readonly status: DevStatusService,
    private readonly logs: DevLogsService,
    private readonly config: ConfigService,
  ) {}

  private assertEnabled() {
    if (!this.config.get<boolean>('DEV_ENDPOINTS_ENABLED')) {
      throw new NotFoundException();
    }
  }

  @Get('status')
  async getStatus() {
    this.assertEnabled();
    return this.status.snapshot();
  }

  @Get('logs')
  async getLogs(
    @Query('correlationId') correlationId?: string,
    @Query('service') service?: string,
    @Query('level') level?: string,
    @Query('limit') limit?: string,
  ) {
    this.assertEnabled();
    return this.logs.query({
      correlationId: correlationId || undefined,
      service: service || undefined,
      level: level || undefined,
      limit: limit ? Number(limit) || undefined : undefined,
    });
  }

  @Sse('logs/stream')
  streamLogs(): Observable<MessageEvent> {
    this.assertEnabled();
    return this.logs.stream();
  }
}
