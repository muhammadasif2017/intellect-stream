import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

// ADR-0007: gateway mints a short-lived signed token per outbound request so
// downstream services can verify trust independently, instead of trusting a
// plain forwarded header on network position alone.
const INTERNAL_TOKEN_TTL_SECONDS = 60;

@Injectable()
export class InternalTokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  mint(userId: string): string {
    return this.jwt.sign(
      { userId },
      {
        secret: this.config.getOrThrow<string>('INTERNAL_JWT_SECRET'),
        expiresIn: INTERNAL_TOKEN_TTL_SECONDS,
      },
    );
  }

  verify(token: string): { userId: string } {
    return this.jwt.verify(token, {
      secret: this.config.getOrThrow<string>('INTERNAL_JWT_SECRET'),
    });
  }
}
