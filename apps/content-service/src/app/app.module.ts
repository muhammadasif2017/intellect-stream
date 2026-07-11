import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnv } from './env';
import { PrismaModule } from './prisma/prisma.module';
import { PostsModule } from './posts/posts.module';
import { OutboxModule } from './outbox/outbox.module';
import { AuthModule } from './auth/auth.module';
import { ModerationModule } from './moderation/moderation.module';
import { DevModule } from './dev/dev.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    AuthModule,
    PostsModule,
    OutboxModule,
    ModerationModule,
    DevModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
