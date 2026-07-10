import { z } from 'zod';
import { baseEnvSchema, createEnvValidator } from '@intellect-stream/shared-config';

// Notification Service's own env requirements — the service owns what it
// needs, the shared lib owns the validation mechanism.
export const notificationServiceEnvSchema = baseEnvSchema.extend({
  // Same secret the gateway signs with (ADR-0007) — verified independently
  // here, not trusted on network position (decision 21).
  INTERNAL_JWT_SECRET: z.string().min(1, 'INTERNAL_JWT_SECRET is required'),
  // Kafka client id is a compile-time constant (KafkaMessagingModule.forRoot()
  // in app.module.ts), not env-configured — see ADR-0009.
  KAFKA_BROKERS: z.string().min(1, 'KAFKA_BROKERS is required'),
});

export type NotificationServiceEnv = z.infer<typeof notificationServiceEnvSchema>;

export const validateEnv = createEnvValidator(notificationServiceEnvSchema);
