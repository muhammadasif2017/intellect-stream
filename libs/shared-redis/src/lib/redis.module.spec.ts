import { createClient } from 'redis';
import { createRedisClient } from './redis.module';

jest.mock('redis');

describe('createRedisClient', () => {
  it('builds a client from REDIS_URL and connects it', async () => {
    const client = { on: jest.fn(), connect: jest.fn().mockResolvedValue(undefined) };
    (createClient as jest.Mock).mockReturnValue(client);
    const config = { getOrThrow: jest.fn().mockReturnValue('redis://localhost:6379') };

    const result = await createRedisClient(config as never);

    expect(config.getOrThrow).toHaveBeenCalledWith('REDIS_URL');
    expect(createClient).toHaveBeenCalledWith({ url: 'redis://localhost:6379' });
    expect(client.connect).toHaveBeenCalled();
    expect(result).toBe(client);
  });

  it('registers an error listener on the client', async () => {
    const client = { on: jest.fn(), connect: jest.fn().mockResolvedValue(undefined) };
    (createClient as jest.Mock).mockReturnValue(client);
    const config = { getOrThrow: jest.fn().mockReturnValue('redis://localhost:6379') };

    await createRedisClient(config as never);

    expect(client.on).toHaveBeenCalledWith('error', expect.any(Function));
  });
});
