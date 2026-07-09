// Separate file so kafka-messaging.module.ts and the two Kafka services can
// both import this token without importing each other.
export const KAFKA_CLIENT_ID = Symbol('KAFKA_CLIENT_ID');
