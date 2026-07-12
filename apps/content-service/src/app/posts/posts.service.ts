import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import { MODERATION_JOB_EVENT_TYPE, ModerationJobPayload } from "@intellect-stream/shared-dtos";
import { PrismaService } from "../prisma/prisma.service";
import { CreatePostDto } from "./dto/create-post.dto";
import { UpdatePostDto } from "./dto/update-post.dto";
import { Prisma } from "../../generated/prisma/client";


@Injectable()
export class PostsService {
  private readonly logger = new Logger(PostsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(authorId: string, dto: CreatePostDto, correlationId?: string) {
    // Gateway-minted when the request came through the edge (ADR-0013);
    // minted here only for callers that bypass the gateway (tests, curl).
    const resolvedCorrelationId = correlationId ?? randomUUID();
    const post = await this.prisma.$transaction(async (tx) => {
      const created = await tx.post.create({ data: { ...dto, authorId } });

      const payload: ModerationJobPayload = { postId: created.id, content: created.content };
      await tx.outboxMessage.create({
        data: {
          correlationId: resolvedCorrelationId,
          eventType: MODERATION_JOB_EVENT_TYPE,
          source: 'content-service',
          // Prisma's Json input type wants an index signature a class instance
          // doesn't structurally have — the payload is a plain data shape.
          payload: payload as unknown as Prisma.InputJsonValue,
        },
      });

      return created;
    });
    // Stage marker for the dashboard's trace view (see PostsProxyService).
    this.logger.log(
      `Post ${post.id} created, outbox row written correlationId=${resolvedCorrelationId}`,
    );
    return post;
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