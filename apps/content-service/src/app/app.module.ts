import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnv } from './env';
import { PrismaModule } from './prisma/prisma.module';
import { PostsModule } from './posts/posts.module';
import { OutboxModule } from './outbox/outbox.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    PostsModule,
    OutboxModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
