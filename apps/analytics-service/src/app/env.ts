import { z } from 'zod';
import { baseEnvSchema, createEnvValidator } from '@intellect-stream/shared-config';

// Analytics Service's own env requirements — the service owns what it needs,
// the shared lib owns the validation mechanism.
export const analyticsServiceEnvSchema = baseEnvSchema.extend({
  ANALYTICS_DATABASE_URL: z.string().min(1, 'ANALYTICS_DATABASE_URL is required'),
  // Kafka client id is a compile-time constant (KafkaMessagingModule.forRoot()
  // in app.module.ts), not env-configured — see ADR-0009.
  KAFKA_BROKERS: z.string().min(1, 'KAFKA_BROKERS is required'),
  // ADR-0007: the trends read API verifies gateway-minted tokens.
  INTERNAL_JWT_SECRET: z.string().min(1, 'INTERNAL_JWT_SECRET is required'),
});

export type AnalyticsServiceEnv = z.infer<typeof analyticsServiceEnvSchema>;

export const validateEnv = createEnvValidator(analyticsServiceEnvSchema);
