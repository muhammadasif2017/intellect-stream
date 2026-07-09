import { z } from 'zod';
import { baseEnvSchema, createEnvValidator } from '@intellect-stream/shared-config';

// AI Processing Service's own env requirements — the service owns what it
// needs, the shared lib owns the validation mechanism.
export const aiProcessingEnvSchema = baseEnvSchema.extend({
  RABBITMQ_URL: z.string().min(1, 'RABBITMQ_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  CF_ACCOUNT_ID: z.string().min(1, 'CF_ACCOUNT_ID is required'),
  CF_API_TOKEN: z.string().min(1, 'CF_API_TOKEN is required'),
});

export type AiProcessingEnv = z.infer<typeof aiProcessingEnvSchema>;

export const validateEnv = createEnvValidator(aiProcessingEnvSchema);
