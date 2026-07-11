import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { InternalTokenService } from '../auth/internal-token.service';
import { SessionGuard } from '../auth/session.guard';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PostsProxyService } from './posts-proxy.service';

@Controller('posts')
@UseGuards(SessionGuard)
export class PostsController {
  constructor(
    private readonly proxy: PostsProxyService,
    private readonly internalToken: InternalTokenService,
  ) {}

  private token(req: Request): string {
    return this.internalToken.mint(req.session.userId as string);
  }

  // The correlationId header on every response gives the client a trace
  // handle for support/debugging — the same id appears in every log line
  // and message this request produced anywhere in the system (ADR-0013).
  private send(res: Response, proxied: { status: number; body: unknown; correlationId: string }) {
    res.setHeader('x-correlation-id', proxied.correlationId);
    if (proxied.body === undefined) {
      res.status(proxied.status).send();
    } else {
      res.status(proxied.status).json(proxied.body);
    }
  }

  @Post()
  async create(@Body() dto: CreatePostDto, @Req() req: Request, @Res() res: Response) {
    this.send(res, await this.proxy.forward('POST', '/posts', this.token(req), dto));
  }

  @Get()
  async findAll(
    @Query('skip') skip: string | undefined,
    @Query('take') take: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const qs = new URLSearchParams();
    if (skip) qs.set('skip', skip);
    if (take) qs.set('take', take);
    const path = qs.toString() ? `/posts?${qs.toString()}` : '/posts';

    this.send(res, await this.proxy.forward('GET', path, this.token(req)));
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    this.send(res, await this.proxy.forward('GET', `/posts/${id}`, this.token(req)));
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePostDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    this.send(res, await this.proxy.forward('PATCH', `/posts/${id}`, this.token(req), dto));
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    this.send(res, await this.proxy.forward('DELETE', `/posts/${id}`, this.token(req)));
  }
}
