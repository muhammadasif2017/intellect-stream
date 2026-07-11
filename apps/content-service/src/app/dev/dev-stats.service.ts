import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OUTBOX_MAX_ATTEMPTS } from '../outbox/outbox.constants';

export interface OutboxStats {
  pending: number;
  quarantined: number;
  published: number;
  oldestPendingAt: Date | null;
}

@Injectable()
export class DevStatsService {
  constructor(private readonly prisma: PrismaService) {}

  // Mirrors the relay's own row semantics (BUG-0006): pending rows are what
  // the relay will still try; quarantined rows have exhausted attempts and
  // wait for manual replay.
  async outboxStats(): Promise<OutboxStats> {
    const [pending, quarantined, published, oldestPending] = await Promise.all(
      [
        this.prisma.outboxMessage.count({
          where: {
            publishedAt: null,
            attempts: { lt: OUTBOX_MAX_ATTEMPTS },
          },
        }),
        this.prisma.outboxMessage.count({
          where: {
            publishedAt: null,
            attempts: { gte: OUTBOX_MAX_ATTEMPTS },
          },
        }),
        this.prisma.outboxMessage.count({
          where: { publishedAt: { not: null } },
        }),
        this.prisma.outboxMessage.findFirst({
          where: { publishedAt: null },
          orderBy: { occurredAt: 'asc' },
          select: { occurredAt: true },
        }),
      ],
    );

    return {
      pending,
      quarantined,
      published,
      oldestPendingAt: oldestPending?.occurredAt ?? null,
    };
  }
}
