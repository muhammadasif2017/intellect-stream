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

  @Post()
  async create(@Body() dto: CreatePostDto, @Req() req: Request, @Res() res: Response) {
    const { status, body } = await this.proxy.forward('POST', '/posts', this.token(req), dto);
    res.status(status).json(body);
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

    const { status, body } = await this.proxy.forward('GET', path, this.token(req));
    res.status(status).json(body);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const { status, body } = await this.proxy.forward('GET', `/posts/${id}`, this.token(req));
    res.status(status).json(body);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePostDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const { status, body } = await this.proxy.forward(
      'PATCH',
      `/posts/${id}`,
      this.token(req),
      dto,
    );
    res.status(status).json(body);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const { status, body } = await this.proxy.forward('DELETE', `/posts/${id}`, this.token(req));
    if (body === undefined) {
      res.status(status).send();
    } else {
      res.status(status).json(body);
    }
  }
}
