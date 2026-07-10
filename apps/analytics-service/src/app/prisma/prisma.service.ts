import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: ConfigService) {
    // Prisma 7: driver adapter is mandatory — the client no longer reads
    // DATABASE_URL itself. Pulling it via ConfigService keeps the validated
    // env (shared-config) as the single source of truth.
    super({
      adapter: new PrismaPg({
        connectionString: config.getOrThrow<string>('ANALYTICS_DATABASE_URL'),
      }),
    });
  }

  async onModuleInit() {
    // Connect eagerly so a bad ANALYTICS_DATABASE_URL fails at bootstrap,
    // not on the first incoming request.
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
