import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { INTERNAL_TOKEN_AUDIENCE, InternalTokenAudience } from '@intellect-stream/shared-dtos';

// ADR-0007: gateway mints a short-lived signed token per outbound request so
// downstream services can verify trust independently, instead of trusting a
// plain forwarded header on network position alone. `aud` scopes the token
// to its intended verifier so a WS ticket can't be replayed as a REST token.
const INTERNAL_TOKEN_TTL_SECONDS = 60;

@Injectable()
export class InternalTokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  mint(userId: string, audience: InternalTokenAudience = INTERNAL_TOKEN_AUDIENCE.API): string {
    return this.jwt.sign(
      { userId },
      {
        secret: this.config.getOrThrow<string>('INTERNAL_JWT_SECRET'),
        expiresIn: INTERNAL_TOKEN_TTL_SECONDS,
        audience,
      },
    );
  }

  verify(token: string, audience: InternalTokenAudience): { userId: string } {
    return this.jwt.verify(token, {
      secret: this.config.getOrThrow<string>('INTERNAL_JWT_SECRET'),
      audience,
    });
  }
}
