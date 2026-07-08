import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnv } from './env';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { PostsModule } from './posts/posts.module';
import { RedisModule } from './redis/redis.module';
import { RateLimitGuard } from './rate-limit/rate-limit.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    RedisModule,
    PrismaModule,
    AuthModule,
    PostsModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: RateLimitGuard }],
})
export class AppModule {}
