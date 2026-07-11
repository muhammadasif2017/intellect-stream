import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { PostsService } from './posts.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { InternalAuthGuard } from '../auth/internal-auth.guard';

@Controller('posts')
@UseGuards(InternalAuthGuard)
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Post()
  create(@Body() dto: CreatePostDto, @Req() req: Request) {
    // ADR-0013: the gateway minted this request's correlationId at the edge;
    // carry it into the outbox so the whole async chain traces as one request.
    const correlationId = req.headers['x-correlation-id'];
    return this.postsService.create(
      req.userId as string,
      dto,
      typeof correlationId === 'string' ? correlationId : undefined,
    );
  }

  @Get()
  findAll(@Query('skip') skip?: string, @Query('take') take?: string) {
    return this.postsService.findAll({ skip: Number(skip) || 0, take: Number(take) || 20 });
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const post = await this.postsService.findOne(id);
    if (!post) throw new NotFoundException();
    return post;
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePostDto, @Req() req: Request) {
    return this.postsService.update(id, req.userId as string, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: Request) {
    return this.postsService.remove(id, req.userId as string);
  }
}