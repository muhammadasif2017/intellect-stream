import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PostsController } from './posts.controller';
import { PostsProxyService } from './posts-proxy.service';

@Module({
  imports: [AuthModule],
  controllers: [PostsController],
  providers: [PostsProxyService],
})
export class PostsModule {}
