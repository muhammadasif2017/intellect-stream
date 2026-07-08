import { Module } from '@nestjs/common';
import { PUBLISHER } from './publisher.interface';
import { RabbitMqConsumer } from './rabbitmq-consumer.service';
import { RabbitMqPublisher } from './rabbitmq-publisher.service';

@Module({
  providers: [
    RabbitMqConsumer,
    RabbitMqPublisher,
    { provide: PUBLISHER, useExisting: RabbitMqPublisher },
  ],
  exports: [PUBLISHER, RabbitMqPublisher, RabbitMqConsumer],
})
export class SharedMessagingModule {}
