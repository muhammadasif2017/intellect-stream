import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SessionGuard } from '../auth/session.guard';
import { DevController } from './dev.controller';
import { DevStatusService } from './dev-status.service';

describe('DevController', () => {
  function makeController(devEnabled: boolean) {
    const status = {
      snapshot: jest.fn().mockResolvedValue({ services: [] }),
    } as unknown as DevStatusService;
    const config = {
      get: jest.fn().mockReturnValue(devEnabled),
    } as unknown as ConfigService;
    return new DevController(status, config);
  }

  it('requires a session — the M2 deferral is closed', () => {
    const guards = Reflect.getMetadata('__guards__', DevController);
    expect(guards).toContain(SessionGuard);
  });

  it('404s when DEV_ENDPOINTS_ENABLED is off', async () => {
    await expect(makeController(false).getStatus()).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns the snapshot when enabled', async () => {
    await expect(makeController(true).getStatus()).resolves.toEqual({
      services: [],
    });
  });
});
