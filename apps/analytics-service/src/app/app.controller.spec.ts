import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController /health', () => {
  it('reports ok with service name and uptime', () => {
    const controller = new AppController(new AppService());
    const health = controller.getHealth();
    expect(health.status).toBe('ok');
    expect(health.service).toBe('analytics-service');
    expect(health.uptime).toBeGreaterThanOrEqual(0);
  });
});
