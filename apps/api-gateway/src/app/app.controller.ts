import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getData() {
    return this.appService.getData();
  }

  @Get('health')
  getHealth() {
    return {
      status: 'ok' as const,
      service: 'api-gateway',
      uptime: Math.round(process.uptime()),
    };
  }
}
