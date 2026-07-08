import { IsArray, IsIn, IsNotEmpty, IsString } from 'class-validator';

// eventType values (decision 5: AI Processing Service publishes
// moderation.completed; Content Service is the sole consumer/writer).
export const MODERATION_JOB_EVENT_TYPE = 'moderation.job';
export const MODERATION_COMPLETED_EVENT_TYPE = 'moderation.completed';

// Queue names. Each has a matching DLQ (decision 10: one failure is
// terminal, no automated retry — see RabbitMqConsumer).
export const MODERATION_JOB_QUEUE = 'moderation.job';
export const MODERATION_JOB_DLQ = 'moderation.job.dlq';
export const MODERATION_COMPLETED_QUEUE = 'moderation.completed';
export const MODERATION_COMPLETED_DLQ = 'moderation.completed.dlq';

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
}
