import { CanActivate, ExecutionContext, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { REDIS_CLIENT } from '@intellect-stream/shared-redis';
import type { Request, Response } from 'express';
import type { RedisClientType } from 'redis';

// Fixed-window counter keyed by IP (SPEC: "API Gateway — Redis rate-limit").
// Tradeoff of fixed window vs sliding window/token bucket: simpler, but a
// client can burst up to 2x the limit across a window boundary (e.g. max
// requests at 0:59 and again at 1:00). Acceptable for this milestone —
// sliding window would need a sorted-set log instead of one counter key.
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 100;

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: RedisClientType) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const key = `ratelimit:${request.ip}`;

    // INCR is atomic; only the request that takes the counter to 1 sets the
    // window's expiry. Narrow race: a crash between INCR and PEXPIRE leaves
    // a key with no TTL — acceptable at this scale, not multi-instance safe.
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.pExpire(key, WINDOW_MS);
    }

    response.setHeader('X-RateLimit-Limit', MAX_REQUESTS);
    response.setHeader('X-RateLimit-Remaining', Math.max(0, MAX_REQUESTS - count));

    if (count > MAX_REQUESTS) {
      throw new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS);
    }

    return true;
  }
}
