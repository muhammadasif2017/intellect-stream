import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { INTERNAL_TOKEN_AUDIENCE } from '@intellect-stream/shared-dtos';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { InternalTokenService } from './internal-token.service';
import { SessionGuard } from './session.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly internalToken: InternalTokenService,
  ) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const user = await this.authService.validateCredentials(dto);
    // Regenerate the session on login to prevent session fixation —
    // a pre-login session ID must never become a post-login authenticated one.
    await new Promise<void>((resolve, reject) => {
      req.session.regenerate((err: Error | null) => (err ? reject(err) : resolve()));
    });
    req.session.userId = user.id;
    return user;
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request) {
    await new Promise<void>((resolve, reject) => {
      req.session.destroy((err: Error | null) => (err ? reject(err) : resolve()));
    });
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@Req() req: Request) {
    return this.authService.findById(req.session.userId as string);
  }

  // Decision 21: client is already session-authenticated here; mint the same
  // gateway-signed internal token REST calls use (ADR-0007) so it can present
  // one at the Notification Service WebSocket handshake. Short TTL is fine —
  // it only has to survive the handshake, not the connection's lifetime.
  @Get('notifications-ticket')
  @UseGuards(SessionGuard)
  notificationsTicket(@Req() req: Request) {
    return {
      token: this.internalToken.mint(
        req.session.userId as string,
        INTERNAL_TOKEN_AUDIENCE.NOTIFICATIONS_WS,
      ),
    };
  }
}
