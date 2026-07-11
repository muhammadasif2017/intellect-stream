import { MODERATION_COMPLETED_EVENT_TYPE, MODERATION_JOB_EVENT_TYPE } from './moderation';

// Decision 9 / ADR-0012: contract changes are additive-only within a version.
// This registry is the single statement of which eventVersion each consumer
// in this workspace understands. A producer that needs a breaking change
// bumps the version here *and* keeps publishing the old shape until every
// consumer has moved — the consumer-side check below turns "consumer met a
// version from the future" into a loud, typed failure instead of a silent
// misparse.
export const EVENT_VERSIONS: Record<string, number> = {
  [MODERATION_JOB_EVENT_TYPE]: 1,
  [MODERATION_COMPLETED_EVENT_TYPE]: 1,
};

export class UnsupportedEventVersionError extends Error {
  constructor(
    readonly eventType: string,
    readonly eventVersion: number,
  ) {
    super(
      `Unsupported event version ${eventVersion} for eventType "${eventType}" ` +
        `(supported: ${EVENT_VERSIONS[eventType] ?? 'none — unknown eventType'})`,
    );
    this.name = 'UnsupportedEventVersionError';
  }
}

// Call at every consumer boundary, next to the class-validator payload check
// (decision 9). Policy on failure is the consumer's, matched to its broker:
// RabbitMQ consumers let it throw (retry cycle → DLQ, BUG-0007); Kafka
// consumers catch it and skip (no Kafka DLQ in this design — crashing the
// consumer would block the whole partition behind one unreadable event).
export function assertSupportedEventVersion(eventType: string, eventVersion: number): void {
  const supported = EVENT_VERSIONS[eventType];
  if (supported === undefined || eventVersion > supported) {
    throw new UnsupportedEventVersionError(eventType, eventVersion);
  }
}
