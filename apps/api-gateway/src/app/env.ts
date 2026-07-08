import { z } from 'zod';
import { baseEnvSchema, createEnvValidator } from '@intellect-stream/shared-config';

// API Gateway's own env requirements — the service owns what it needs,
// the shared lib owns the validation mechanism.
export const gatewayEnvSchema = baseEnvSchema.extend({
  GATEWAY_DATABASE_URL: z.string().min(1, 'GATEWAY_DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  SESSION_SECRET: z.string().min(1, 'SESSION_SECRET is required'),
  INTERNAL_JWT_SECRET: z.string().min(1, 'INTERNAL_JWT_SECRET is required'),
  CONTENT_SERVICE_URL: z.string().min(1, 'CONTENT_SERVICE_URL is required'),
});

export type GatewayEnv = z.infer<typeof gatewayEnvSchema>;

export const validateEnv = createEnvValidator(gatewayEnvSchema);
