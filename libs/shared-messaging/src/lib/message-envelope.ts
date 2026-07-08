// Shape defined in ADR-0006. messageId = outbox row UUID for outbox-originated
// messages (decision 6); non-outbox publishers mint their own UUID.
export interface MessageEnvelope<TPayload = unknown> {
  messageId: string;
  correlationId: string;
  eventType: string;
  eventVersion: number;
  occurredAt: Date | string;
  source: string;
  payload: TPayload;
}
