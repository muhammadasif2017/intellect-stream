import { Logger } from '@nestjs/common';
import type { Socket } from 'socket.io';
import { MessageEnvelope } from '@intellect-stream/shared-messaging';
import { ModerationCompletedPayload } from '@intellect-stream/shared-dtos';
import { ModerationPushService } from './moderation-push.service';

function envelope(
  payload: ModerationCompletedPayload,
): MessageEnvelope<ModerationCompletedPayload> {
  return {
    messageId: 'm1',
    correlationId: 'c1',
    eventType: 'moderation.completed',
    eventVersion: 1,
    occurredAt: '2026-07-10T10:30:00.000Z',
    source: 'content-service',
    payload,
  };
}

function fakeSocket(): Socket {
  return { emit: jest.fn() } as unknown as Socket;
}

describe('ModerationPushService', () => {
  let consumerMock: { consume: jest.Mock };
  let registryMock: { getSockets: jest.Mock };
  let service: ModerationPushService;

  beforeEach(async () => {
    consumerMock = { consume: jest.fn().mockResolvedValue(undefined) };
    registryMock = { getSockets: jest.fn().mockReturnValue([]) };

    service = new ModerationPushService(consumerMock as never, registryMock as never);
    await service.onModuleInit();
  });

  function getHandler() {
    return consumerMock.consume.mock.calls[0][1] as (
      e: MessageEnvelope<ModerationCompletedPayload>,
    ) => Promise<void>;
  }

  it('subscribes to moderation-completed-events with a per-instance group id', () => {
    expect(consumerMock.consume).toHaveBeenCalledWith(
      { topic: 'moderation-completed-events', groupId: expect.stringMatching(/^notification-service-/) },
      expect.any(Function),
    );
  });

  it('pushes the verdict to every socket the author has registered', async () => {
    const socketA = fakeSocket();
    const socketB = fakeSocket();
    registryMock.getSockets.mockReturnValue([socketA, socketB]);

    await getHandler()(
      envelope({ postId: 'p1', verdict: 'rejected', categories: ['spam'], authorId: 'u1' }),
    );

    expect(registryMock.getSockets).toHaveBeenCalledWith('u1');
    for (const socket of [socketA, socketB]) {
      expect(socket.emit).toHaveBeenCalledWith('moderation.completed', {
        postId: 'p1',
        verdict: 'rejected',
        categories: ['spam'],
      });
    }
  });

  it('logs a stage marker (with correlationId) and does not throw when the author has no live sockets', async () => {
    registryMock.getSockets.mockReturnValue([]);
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    await expect(
      getHandler()(envelope({ postId: 'p1', verdict: 'approved', categories: [], authorId: 'u1' })),
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('correlationId=c1'));
    warnSpy.mockRestore();
  });

  it('drops the event and never looks up the registry when authorId is missing', async () => {
    await getHandler()(envelope({ postId: 'p1', verdict: 'approved', categories: [] }));

    expect(registryMock.getSockets).not.toHaveBeenCalled();
  });

  it('rejects a payload that fails validation before touching the registry', async () => {
    await expect(
      getHandler()(
        envelope({ postId: 'p1', verdict: 'maybe' as never, categories: [], authorId: 'u1' }),
      ),
    ).rejects.toBeTruthy();
    expect(registryMock.getSockets).not.toHaveBeenCalled();
  });
});
