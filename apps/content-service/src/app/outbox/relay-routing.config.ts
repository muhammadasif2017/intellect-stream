import {
  MODERATION_COMPLETED_EVENT_TYPE,
  MODERATION_COMPLETED_TOPIC,
  MODERATION_JOB_EVENT_TYPE,
  MODERATION_JOB_QUEUE,
} from '@intellect-stream/shared-dtos';

export type Broker = 'rabbitmq' | 'kafka';

export interface RelayRoute {
  broker: Broker;
  destination: string;
}

// Decision 14 / ADR-0009: routing is a relay-config concern (eventType ->
// broker + destination), not a column on the outbox row — one event can fan
// out to multiple destinations later without minting duplicate outbox rows.
export const RELAY_ROUTING: Record<string, RelayRoute> = {
  [MODERATION_JOB_EVENT_TYPE]: { broker: 'rabbitmq', destination: MODERATION_JOB_QUEUE },
  [MODERATION_COMPLETED_EVENT_TYPE]: { broker: 'kafka', destination: MODERATION_COMPLETED_TOPIC },
};
