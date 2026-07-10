import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

// ADR-0007 / decision 21: verify the gateway-minted token independently —
// this service does not trust the caller's network position, only a valid
// signature. Same shared-secret check as Content Service's InternalAuthGuard,
// just invoked at the WebSocket handshake instead of per-REST-request, since
// a WS connection has no per-message guard lifecycle to hook into.
@Injectable()
export class InternalTokenVerifierService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  verify(token: string): { userId: string } {
    return this.jwt.verify<{ userId: string }>(token, {
      secret: this.config.getOrThrow<string>('INTERNAL_JWT_SECRET'),
    });
  }
}
