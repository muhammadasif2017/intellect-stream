import { z } from 'zod';
import { baseEnvSchema, createEnvValidator } from '@intellect-stream/shared-config';

// Content Service's own env requirements — the service owns what it needs,
// the shared lib owns the validation mechanism.
export const contentServiceEnvSchema = baseEnvSchema.extend({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  RABBITMQ_URL: z.string().min(1, 'RABBITMQ_URL is required'),
  INTERNAL_JWT_SECRET: z.string().min(1, 'INTERNAL_JWT_SECRET is required'),
});

export type ContentServiceEnv = z.infer<typeof contentServiceEnvSchema>;

export const validateEnv = createEnvValidator(contentServiceEnvSchema);
