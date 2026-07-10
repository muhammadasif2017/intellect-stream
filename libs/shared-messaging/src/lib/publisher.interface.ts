// Decision 14: relay routing is an eventType->destination mapping, kept behind
// this interface so a Kafka publisher can slot in at milestone 6 without the
// relay caring which broker a given destination actually is.
export interface Publisher {
  publish(destination: string, message: unknown): Promise<void>;
}

export const PUBLISHER = Symbol('PUBLISHER');

// ADR-0009: second broker, same interface. Kept as a distinct token (not a
// second binding of PUBLISHER) so a consumer that needs both — the outbox
// relay's broker registry — can inject each publisher by its own identity.
export const KAFKA_PUBLISHER = Symbol('KAFKA_PUBLISHER');
