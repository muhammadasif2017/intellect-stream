import * as amqp from 'amqplib';

// BUG-0007: bounded retry before the DLQ. A failed delivery dead-letters to
// <queue>.retry (no consumer, per-queue TTL); on expiry it dead-letters back
// to <queue>, growing the message's x-death count by one per cycle. The
// consumer routes a message to <queue>.dlq only once that count reaches
// MAX_DELIVERIES — so the DLQ receives poison messages, not transiently
// unlucky ones (decision 10's manual-replay posture now applies only where
// a human is genuinely needed).
export const MAX_DELIVERIES = 5;
export const RETRY_TTL_MS = 15_000;

export function deadLetterQueueName(queue: string): string {
  return `${queue}.dlq`;
}

export function retryQueueName(queue: string): string {
  return `${queue}.retry`;
}

// Decision 10: every queue gets a matching DLQ. RabbitMQ rejects a queue
// redeclaration whose arguments don't match the first declaration (406
// PRECONDITION-FAILED) — so this must be the *only* place that declares
// queue arguments, called identically by every publisher and consumer that
// touches a given queue. Same rule is why MAX_DELIVERIES/RETRY_TTL_MS live
// here: every party must agree on the retry contract.
//
// BUG-0007 deployment note: this change alters the main queue's DLX target
// (dlq → retry). Existing dev queues must be deleted before services restart,
// or assertQueue fails with the 406 above.
export async function assertQueueTopology(channel: amqp.Channel, queue: string): Promise<void> {
  const dlq = deadLetterQueueName(queue);
  const retry = retryQueueName(queue);
  await channel.assertQueue(dlq, { durable: true });
  await channel.assertQueue(retry, {
    durable: true,
    arguments: {
      'x-message-ttl': RETRY_TTL_MS,
      'x-dead-letter-exchange': '',
      'x-dead-letter-routing-key': queue,
    },
  });
  await channel.assertQueue(queue, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': '',
      'x-dead-letter-routing-key': retry,
    },
  });
}
