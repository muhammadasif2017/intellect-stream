import {
  Controller,
  Get,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SessionGuard } from '../auth/session.guard';
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
    private readonly config: ConfigService,
  ) {}

  @Get('status')
  async getStatus() {
    if (!this.config.get<boolean>('DEV_ENDPOINTS_ENABLED')) {
      throw new NotFoundException();
    }
    return this.status.snapshot();
  }
}
