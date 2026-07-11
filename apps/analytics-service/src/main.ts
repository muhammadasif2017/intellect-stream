/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { ConsoleLogger, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // ADR-0013: LOG_FORMAT=json emits one-line structured logs for
    // aggregation; default stays human-readable for local dev.
    logger: process.env.LOG_FORMAT === 'json' ? new ConsoleLogger({ json: true }) : undefined,
  });
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  const port = process.env.PORT || 3003;
  await app.listen(port);
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
}

bootstrap();
