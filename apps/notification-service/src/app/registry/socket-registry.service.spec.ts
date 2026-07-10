import type { Socket } from 'socket.io';
import { SocketRegistryService } from './socket-registry.service';

function fakeSocket(): Socket {
  return { id: Math.random().toString(36) } as unknown as Socket;
}

describe('SocketRegistryService', () => {
  let registry: SocketRegistryService;

  beforeEach(() => {
    registry = new SocketRegistryService();
  });

  it('returns no sockets for an unknown user', () => {
    expect(registry.getSockets('u1')).toEqual([]);
  });

  it('returns a registered socket for its user', () => {
    const socket = fakeSocket();
    registry.register('u1', socket);

    expect(registry.getSockets('u1')).toEqual([socket]);
  });

  it('supports multiple sockets for the same user (e.g. phone + laptop)', () => {
    const socketA = fakeSocket();
    const socketB = fakeSocket();
    registry.register('u1', socketA);
    registry.register('u1', socketB);

    expect(registry.getSockets('u1')).toEqual(expect.arrayContaining([socketA, socketB]));
    expect(registry.getSockets('u1')).toHaveLength(2);
  });

  it('removes a socket on unregister, keeping the user entry if others remain', () => {
    const socketA = fakeSocket();
    const socketB = fakeSocket();
    registry.register('u1', socketA);
    registry.register('u1', socketB);

    registry.unregister('u1', socketA);

    expect(registry.getSockets('u1')).toEqual([socketB]);
  });

  it('drops the user entry entirely once their last socket unregisters', () => {
    const socket = fakeSocket();
    registry.register('u1', socket);

    registry.unregister('u1', socket);

    expect(registry.getSockets('u1')).toEqual([]);
  });

  it('does not throw when unregistering a user that was never registered', () => {
    expect(() => registry.unregister('ghost', fakeSocket())).not.toThrow();
  });

  it('keeps different users isolated', () => {
    const socketA = fakeSocket();
    const socketB = fakeSocket();
    registry.register('u1', socketA);
    registry.register('u2', socketB);

    expect(registry.getSockets('u1')).toEqual([socketA]);
    expect(registry.getSockets('u2')).toEqual([socketB]);
  });
});
