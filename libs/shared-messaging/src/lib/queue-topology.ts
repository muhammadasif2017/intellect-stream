import * as amqp from 'amqplib';

export function deadLetterQueueName(queue: string): string {
  return `${queue}.dlq`;
}

// Decision 10: every queue gets a matching DLQ. RabbitMQ rejects a queue
// redeclaration whose arguments don't match the first declaration (406
// PRECONDITION-FAILED) — so this must be the *only* place that declares
// queue arguments, called identically by every publisher and consumer that
// touches a given queue.
export async function assertQueueTopology(channel: amqp.Channel, queue: string): Promise<void> {
  const dlq = deadLetterQueueName(queue);
  await channel.assertQueue(dlq, { durable: true });
  await channel.assertQueue(queue, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': '',
      'x-dead-letter-routing-key': dlq,
    },
  });
}
