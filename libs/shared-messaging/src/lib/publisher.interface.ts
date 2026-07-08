// Decision 14: relay routing is an eventType->destination mapping, kept behind
// this interface so a Kafka publisher can slot in at milestone 6 without the
// relay caring which broker a given destination actually is.
export interface Publisher {
  publish(destination: string, message: unknown): Promise<void>;
}

export const PUBLISHER = Symbol('PUBLISHER');
