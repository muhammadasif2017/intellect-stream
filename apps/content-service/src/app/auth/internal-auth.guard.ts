import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

// ADR-0007: verify the gateway-minted token independently — this service
// does not trust the caller's network position, only a valid signature.
@Injectable()
export class InternalAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

    if (!token) {
      throw new UnauthorizedException('Missing internal token');
    }

    try {
      const payload = this.jwt.verify<{ userId: string }>(token, {
        secret: this.config.getOrThrow<string>('INTERNAL_JWT_SECRET'),
      });
      request.userId = payload.userId;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid internal token');
    }
  }
}
