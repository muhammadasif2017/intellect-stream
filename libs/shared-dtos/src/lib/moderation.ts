import { IsArray, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

// eventType values (decision 5: AI Processing Service publishes
// moderation.completed; Content Service is the sole consumer/writer).
export const MODERATION_JOB_EVENT_TYPE = 'moderation.job';
export const MODERATION_COMPLETED_EVENT_TYPE = 'moderation.completed';

// Queue names. Each gets a matching DLQ automatically (see
// assertQueueTopology in shared-messaging) — decision 10: one failure is
// terminal, no automated retry.
export const MODERATION_JOB_QUEUE = 'moderation.job';
export const MODERATION_COMPLETED_QUEUE = 'moderation.completed';

// Kafka topic the same moderation.completed fact is relayed onward to, from
// Content Service's outbox, for Analytics Service to consume (ADR-0009).
export const MODERATION_COMPLETED_TOPIC = 'moderation-completed-events';

export class ModerationJobPayload {
  @IsString()
  @IsNotEmpty()
  postId!: string;

  @IsString()
  content!: string;
}

export type ModerationVerdict = 'approved' | 'rejected';

export class ModerationCompletedPayload {
  @IsString()
  @IsNotEmpty()
  postId!: string;

  @IsIn(['approved', 'rejected'])
  verdict!: ModerationVerdict;

  @IsArray()
  @IsString({ each: true })
  categories!: string[];

  // Decision 22: only Content Service knows the post's author (AI Processing
  // Service, the other producer of this same class over RabbitMQ, does not),
  // so this is optional here and filled in when Content Service relays the
  // fact onward to Kafka — Notification Service needs it to resolve which
  // user's socket to push to.
  @IsOptional()
  @IsString()
  authorId?: string;
}
