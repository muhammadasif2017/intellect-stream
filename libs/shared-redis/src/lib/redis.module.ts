import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

export async function createRedisClient(config: ConfigService): Promise<RedisClientType> {
  const client: RedisClientType = createClient({
    url: config.getOrThrow<string>('REDIS_URL'),
  });
  client.on('error', (err) => Logger.error('Redis client error', err, 'Redis'));
  await client.connect();
  return client;
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: createRedisClient,
      inject: [ConfigService],
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
