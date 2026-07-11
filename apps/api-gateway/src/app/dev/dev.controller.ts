import { Controller, Get, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DevStatusService } from './dev-status.service';

// Dashboard-only introspection. Gated by DEV_ENDPOINTS_ENABLED — disabled
// deployments 404 as if the route doesn't exist. Session auth intentionally
// deferred to M3 (the dashboard has no login flow yet); the flag is the
// boundary until then. See docs/plan/pipeline-dashboard.md, M2 note.
@Controller('dev')
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
