import { DynamicModule, Module } from '@nestjs/common';
import { KafkaConsumer } from './kafka-consumer.service';
import { KAFKA_CLIENT_ID } from './kafka-client-id.token';
import { KafkaPublisher } from './kafka-publisher.service';
import { KAFKA_PUBLISHER } from './publisher.interface';

export interface KafkaMessagingModuleOptions {
  clientId: string;
}

// Separate from SharedMessagingModule (RabbitMQ) so services that don't
// touch Kafka — ai-processing-service, api-gateway — never attempt a Kafka
// connection at bootstrap. Only imported where actually needed
// (content-service, analytics-service).
//
// clientId is a compile-time identity, not runtime config: each importer
// passes its own service name via forRoot() rather than an env var, so two
// services sharing one root .env file can't collide on the same Kafka
// client id (KAFKA_BROKERS is still shared via env — the broker address is
// genuinely the same for every service).
@Module({})
export class KafkaMessagingModule {
  static forRoot(options: KafkaMessagingModuleOptions): DynamicModule {
    return {
      module: KafkaMessagingModule,
      providers: [
        KafkaConsumer,
        KafkaPublisher,
        { provide: KAFKA_CLIENT_ID, useValue: options.clientId },
        { provide: KAFKA_PUBLISHER, useExisting: KafkaPublisher },
      ],
      exports: [KAFKA_PUBLISHER, KafkaPublisher, KafkaConsumer],
    };
  }
}
