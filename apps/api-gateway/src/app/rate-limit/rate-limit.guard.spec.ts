import { ExecutionContext, HttpException } from '@nestjs/common';
import type { RedisClientType } from 'redis';
import { RateLimitGuard } from './rate-limit.guard';

const redisMock = {
  incr: jest.fn(),
  pExpire: jest.fn(),
};

function contextForIp(ip: string): { context: ExecutionContext; setHeader: jest.Mock } {
  const setHeader = jest.fn();
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({ ip }),
      getResponse: () => ({ setHeader }),
    }),
  } as unknown as ExecutionContext;
  return { context, setHeader };
}

describe('RateLimitGuard', () => {
  let guard: RateLimitGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new RateLimitGuard(redisMock as unknown as RedisClientType);
  });

  it('allows the request under the limit and sets rate-limit headers', async () => {
    redisMock.incr.mockResolvedValue(5);
    const { context, setHeader } = contextForIp('1.2.3.4');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 100);
    expect(setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 95);
  });

  it('sets the window expiry only on the first request (count === 1)', async () => {
    redisMock.incr.mockResolvedValue(1);
    const { context } = contextForIp('1.2.3.4');

    await guard.canActivate(context);
    expect(redisMock.pExpire).toHaveBeenCalledWith('ratelimit:1.2.3.4', 60_000);
  });

  it('does not reset the expiry on subsequent requests within the window', async () => {
    redisMock.incr.mockResolvedValue(2);
    const { context } = contextForIp('1.2.3.4');

    await guard.canActivate(context);
    expect(redisMock.pExpire).not.toHaveBeenCalled();
  });

  it('throws 429 once the count exceeds the limit', async () => {
    redisMock.incr.mockResolvedValue(101);
    const { context } = contextForIp('1.2.3.4');

    await expect(guard.canActivate(context)).rejects.toThrow(HttpException);
  });

  it('keys the counter per IP', async () => {
    redisMock.incr.mockResolvedValue(1);
    const { context } = contextForIp('9.9.9.9');

    await guard.canActivate(context);
    expect(redisMock.incr).toHaveBeenCalledWith('ratelimit:9.9.9.9');
  });
});
