import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const BCRYPT_ROUNDS = 12;
// Used when no user exists, so bcrypt.compare still runs — constant-time
// against the "wrong password" branch, so the response doesn't leak whether
// an email is registered.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  // Responds identically whether dto.email was already registered or not —
  // a distinct status/body here would let an attacker enumerate accounts
  // (the same reason validateCredentials compares against DUMMY_HASH below).
  async register(dto: RegisterDto) {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    try {
      await this.prisma.user.create({
        data: { email: dto.email, passwordHash },
      });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) {
        throw e;
      }
    }

    return { email: dto.email };
  }

  async validateCredentials(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const passwordMatches = await bcrypt.compare(
      dto.password,
      user?.passwordHash ?? DUMMY_HASH,
    );

    if (!user || !passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return { id: user.id, email: user.email };
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    return user ? { id: user.id, email: user.email } : null;
  }
}
