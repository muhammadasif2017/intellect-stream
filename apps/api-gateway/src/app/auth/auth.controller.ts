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
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SessionGuard } from './session.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
}
