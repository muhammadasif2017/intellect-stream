import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SessionGuard } from '../auth/session.guard';
import { DevController } from './dev.controller';
import { DevLogsService } from './dev-logs.service';
import { DevStatusService } from './dev-status.service';

describe('DevController', () => {
  const logsQuery = jest.fn().mockResolvedValue([]);

  function makeController(devEnabled: boolean) {
    const status = {
      snapshot: jest.fn().mockResolvedValue({ services: [] }),
    } as unknown as DevStatusService;
    const logs = { query: logsQuery } as unknown as DevLogsService;
    const config = {
      get: jest.fn().mockReturnValue(devEnabled),
    } as unknown as ConfigService;
    return new DevController(status, logs, config);
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

  it('normalizes empty log query params to undefined', async () => {
    await makeController(true).getLogs('', '', '', '');
    expect(logsQuery).toHaveBeenCalledWith({
      correlationId: undefined,
      service: undefined,
      level: undefined,
      limit: undefined,
    });
  });

  it('404s log endpoints when the flag is off', async () => {
    await expect(makeController(false).getLogs()).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
