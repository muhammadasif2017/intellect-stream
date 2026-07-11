import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import { MODERATION_JOB_EVENT_TYPE, ModerationJobPayload } from "@intellect-stream/shared-dtos";
import { PrismaService } from "../prisma/prisma.service";
import { CreatePostDto } from "./dto/create-post.dto";
import { UpdatePostDto } from "./dto/update-post.dto";
import { Prisma } from "../../generated/prisma/client";


@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  create(authorId: string, dto: CreatePostDto) {
    return this.prisma.$transaction(async (tx) => {
      const post = await tx.post.create({ data: { ...dto, authorId } });

      const payload: ModerationJobPayload = { postId: post.id, content: post.content };
      await tx.outboxMessage.create({
        data: {
          correlationId: randomUUID(),
          eventType: MODERATION_JOB_EVENT_TYPE,
          source: 'content-service',
          // Prisma's Json input type wants an index signature a class instance
          // doesn't structurally have — the payload is a plain data shape.
          payload: payload as unknown as Prisma.InputJsonValue,
        },
      });

      return post;
    });
  }

  // Reads are scoped to approved posts only — pending/rejected content
  // hasn't cleared moderation and shouldn't be visible through the public
  // read API just because a caller knows or guesses its id.
  findAll(params: { skip: number; take: number }) {
    return this.prisma.post.findMany({
      where: { status: 'approved' },
      skip: params.skip,
      take: params.take,
    });
  }

  findOne(id: string) {
    return this.prisma.post.findFirst({ where: { id, status: 'approved' } });
  }

  async update(id: string, authorId: string, dto: UpdatePostDto) {
    const { count } = await this.prisma.post.updateMany({ where: { id, authorId }, data: dto });
    if (count === 0) throw new NotFoundException();
    return this.prisma.post.findUnique({ where: { id } });
  }

  async remove(id: string, authorId: string) {
    const { count } = await this.prisma.post.deleteMany({ where: { id, authorId } });
    if (count === 0) throw new NotFoundException();
  }
}