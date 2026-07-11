import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DevController } from './dev.controller';
import { DevStatsService } from './dev-stats.service';

describe('DevController', () => {
  const statsResult = {
    pending: 2,
    quarantined: 1,
    published: 40,
    oldestPendingAt: new Date('2026-07-11T10:00:00Z'),
  };

  function makeController(devEnabled: boolean) {
    const stats = {
      outboxStats: jest.fn().mockResolvedValue(statsResult),
    } as unknown as DevStatsService;
    const config = {
      get: jest.fn().mockReturnValue(devEnabled),
    } as unknown as ConfigService;
    return new DevController(stats, config);
  }

  it('404s when DEV_ENDPOINTS_ENABLED is off — route hidden, not forbidden', async () => {
    const controller = makeController(false);
    await expect(controller.outboxStats()).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns outbox stats when enabled', async () => {
    const controller = makeController(true);
    await expect(controller.outboxStats()).resolves.toEqual(statsResult);
  });
});
