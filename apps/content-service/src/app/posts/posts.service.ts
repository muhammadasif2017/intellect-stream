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

  findAll(params: { skip: number; take: number }) {
    return this.prisma.post.findMany({ skip: params.skip, take: params.take });
  }

  findOne(id: string) {
    return this.prisma.post.findUnique({ where: { id } });
  }

  async update(id: string, dto: UpdatePostDto) {
    try {
      return await this.prisma.post.update({ where: { id }, data: dto });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new NotFoundException();
      }
      throw e;
    }
  }

  async remove(id: string) {
    try {
      return await this.prisma.post.delete({ where: { id } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new NotFoundException();
      }
      throw e;
    }
  }
}