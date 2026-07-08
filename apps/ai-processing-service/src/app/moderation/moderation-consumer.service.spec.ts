import { MessageEnvelope } from '@intellect-stream/shared-messaging';
import { ModerationJobPayload } from '@intellect-stream/shared-dtos';
import { ModerationConsumerService } from './moderation-consumer.service';

describe('ModerationConsumerService', () => {
  let consumerMock: { consume: jest.Mock };
  let publisherMock: { publish: jest.Mock };
  let redisMock: { set: jest.Mock; del: jest.Mock };
  let cfWorkersAiMock: { classify: jest.Mock };
  let service: ModerationConsumerService;

  const envelope: MessageEnvelope<ModerationJobPayload> = {
    messageId: 'm1',
    correlationId: 'c1',
    eventType: 'moderation.job',
    eventVersion: 1,
    occurredAt: new Date().toISOString(),
    source: 'content-service',
    payload: { postId: 'p1', content: 'hello world' },
  };

  beforeEach(async () => {
    consumerMock = { consume: jest.fn().mockResolvedValue(undefined) };
    publisherMock = { publish: jest.fn().mockResolvedValue(undefined) };
    redisMock = { set: jest.fn().mockResolvedValue('OK'), del: jest.fn().mockResolvedValue(1) };
    cfWorkersAiMock = {
      classify: jest.fn().mockResolvedValue({ verdict: 'approved', categories: [] }),
    };

    service = new ModerationConsumerService(
      consumerMock as never,
      publisherMock as never,
      redisMock as never,
      cfWorkersAiMock as never,
    );
    await service.onModuleInit();
  });

  function getHandler() {
    return consumerMock.consume.mock.calls[0][1] as (
      e: MessageEnvelope<ModerationJobPayload>,
    ) => Promise<void>;
  }

  it('subscribes to the moderation.job queue with its DLQ', () => {
    expect(consumerMock.consume).toHaveBeenCalledWith(
      { queue: 'moderation.job', deadLetterQueue: 'moderation.job.dlq' },
      expect.any(Function),
    );
  });

  it('claims the dedupe key before processing', async () => {
    await getHandler()(envelope);

    expect(redisMock.set).toHaveBeenNthCalledWith(1, 'moderation:processed:m1', 'processing', {
      NX: true,
      EX: 300,
    });
  });

  it('skips processing when the dedupe key is already claimed (duplicate delivery)', async () => {
    redisMock.set.mockResolvedValueOnce(null);

    await getHandler()(envelope);

    expect(cfWorkersAiMock.classify).not.toHaveBeenCalled();
    expect(publisherMock.publish).not.toHaveBeenCalled();
  });

  it('classifies content and publishes moderation.completed, preserving correlationId', async () => {
    cfWorkersAiMock.classify.mockResolvedValue({ verdict: 'rejected', categories: ['S1'] });

    await getHandler()(envelope);

    expect(cfWorkersAiMock.classify).toHaveBeenCalledWith('hello world');
    expect(publisherMock.publish).toHaveBeenCalledWith(
      'moderation.completed',
      expect.objectContaining({
        correlationId: 'c1',
        eventType: 'moderation.completed',
        source: 'ai-processing-service',
        payload: { postId: 'p1', verdict: 'rejected', categories: ['S1'] },
      }),
    );
  });

  it('marks the dedupe key done after a successful publish', async () => {
    await getHandler()(envelope);

    expect(redisMock.set).toHaveBeenNthCalledWith(2, 'moderation:processed:m1', 'done', {
      EX: 86400,
    });
  });

  it('releases the dedupe claim and rethrows when the payload fails validation', async () => {
    const invalid: MessageEnvelope<ModerationJobPayload> = {
      ...envelope,
      payload: { postId: '', content: 'x' },
    };

    await expect(getHandler()(invalid)).rejects.toBeTruthy();

    expect(redisMock.del).toHaveBeenCalledWith('moderation:processed:m1');
    expect(publisherMock.publish).not.toHaveBeenCalled();
  });

  it('releases the dedupe claim and rethrows when Cloudflare Workers AI call fails', async () => {
    cfWorkersAiMock.classify.mockRejectedValue(new Error('CF Workers AI unreachable'));

    await expect(getHandler()(envelope)).rejects.toThrow('CF Workers AI unreachable');

    expect(redisMock.del).toHaveBeenCalledWith('moderation:processed:m1');
    expect(publisherMock.publish).not.toHaveBeenCalled();
  });
});
