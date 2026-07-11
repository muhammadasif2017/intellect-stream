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
  // Pipeline-dashboard introspection (/dev/*) — off unless a dev opts in.
  // Defaults below point at the local docker-compose stack; only the flag
  // itself has to be set explicitly.
  DEV_ENDPOINTS_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  DASHBOARD_ORIGIN: z.string().default('http://localhost:4200'),
  AI_SERVICE_URL: z.string().default('http://localhost:3002'),
  ANALYTICS_SERVICE_URL: z.string().default('http://localhost:3003'),
  NOTIFICATION_SERVICE_URL: z.string().default('http://localhost:3004'),
  RABBITMQ_MGMT_URL: z.string().default('http://localhost:15672'),
  RABBITMQ_MGMT_USER: z.string().default('guest'),
  RABBITMQ_MGMT_PASS: z.string().default('guest'),
});

export type GatewayEnv = z.infer<typeof gatewayEnvSchema>;

export const validateEnv = createEnvValidator(gatewayEnvSchema);
