/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { ConsoleLogger, Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { RedisStore } from 'connect-redis';
import session from 'express-session';
import type { RedisClientType } from 'redis';
import { REDIS_CLIENT } from '@intellect-stream/shared-redis';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // ADR-0013: LOG_FORMAT=json emits one-line structured logs for
    // aggregation; default stays human-readable for local dev.
    logger: process.env.LOG_FORMAT === 'json' ? new ConsoleLogger({ json: true }) : undefined,
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  const config = app.get(ConfigService);
  // Same connection the rate-limit guard uses — one Redis client for the
  // whole app instead of each concern opening its own.
  const redisClient = app.get<RedisClientType>(REDIS_CLIENT);

  const isProduction = config.get<string>('NODE_ENV') === 'production';
  app.use(
    session({
      store: new RedisStore({ client: redisClient, prefix: 'sess:' }),
      secret: config.getOrThrow<string>('SESSION_SECRET'),
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        maxAge: 60 * 60 * 1000,
      },
    }),
  );

  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  const port = process.env.PORT || 3000;
  await app.listen(port);
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
}

bootstrap();
