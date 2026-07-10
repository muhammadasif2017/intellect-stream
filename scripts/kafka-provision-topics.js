// ADR-0009: KAFKA_AUTO_CREATE_TOPICS_ENABLE is off — topics are created here,
// deliberately, not implied by whichever service subscribes first.
//
// Topic name must match MODERATION_COMPLETED_TOPIC in
// libs/shared-dtos/src/lib/moderation.ts (plain Node script, no TS path
// aliases, so the value is duplicated rather than imported).
const { Kafka } = require('kafkajs');

const TOPICS = [{ topic: 'moderation-completed-events', numPartitions: 3, replicationFactor: 1 }];

async function main() {
  const brokers = (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',');
  const kafka = new Kafka({ clientId: 'kafka-topic-provisioner', brokers });
  const admin = kafka.admin();

  await admin.connect();
  try {
    const created = await admin.createTopics({ topics: TOPICS, waitForLeaders: true });
    if (created) {
      console.log(`Created: ${TOPICS.map((t) => t.topic).join(', ')}`);
    } else {
      console.log('Already provisioned, nothing to do.');
    }
  } finally {
    await admin.disconnect();
  }
}

main().catch((err) => {
  console.error('Topic provisioning failed:', err);
  process.exitCode = 1;
});
