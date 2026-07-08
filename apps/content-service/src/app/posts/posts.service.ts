import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { CreatePostDto } from "./dto/create-post.dto";
import { UpdatePostDto } from "./dto/update-post.dto";
import { Prisma } from "../../generated/prisma/client";


@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreatePostDto) {
    return this.prisma.$transaction(async (tx) => {
      const post = await tx.post.create({ data: dto });

      await tx.outboxMessage.create({
        data: {
          correlationId: randomUUID(),
          eventType: 'moderation.job',
          source: 'content-service',
          payload: { postId: post.id, content: post.content },
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