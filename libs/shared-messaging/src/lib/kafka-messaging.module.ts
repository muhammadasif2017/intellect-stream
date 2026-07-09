import { Module } from '@nestjs/common';
import { KAFKA_PUBLISHER } from './publisher.interface';
import { KafkaConsumer } from './kafka-consumer.service';
import { KafkaPublisher } from './kafka-publisher.service';

// Separate from SharedMessagingModule (RabbitMQ) so services that don't
// touch Kafka — ai-processing-service, api-gateway — never attempt a Kafka
// connection at bootstrap. Only imported where actually needed
// (content-service, analytics-service).
@Module({
  providers: [
    KafkaConsumer,
    KafkaPublisher,
    { provide: KAFKA_PUBLISHER, useExisting: KafkaPublisher },
  ],
  exports: [KAFKA_PUBLISHER, KafkaPublisher, KafkaConsumer],
})
export class KafkaMessagingModule {}
