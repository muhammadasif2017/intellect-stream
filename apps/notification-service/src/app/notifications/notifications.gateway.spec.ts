import type { Socket } from 'socket.io';
import { NotificationsGateway } from './notifications.gateway';
import { InternalTokenVerifierService } from '../auth/internal-token-verifier.service';
import { SocketRegistryService } from '../registry/socket-registry.service';

function fakeSocket(opts: { auth?: Record<string, unknown>; query?: Record<string, unknown> }): Socket {
  return {
    id: 's1',
    data: {},
    handshake: { auth: opts.auth ?? {}, query: opts.query ?? {} },
    disconnect: jest.fn(),
  } as unknown as Socket;
}

describe('NotificationsGateway', () => {
  let verifier: { verify: jest.Mock };
  let registry: { register: jest.Mock; unregister: jest.Mock };
  let gateway: NotificationsGateway;

  beforeEach(() => {
    verifier = { verify: jest.fn() };
    registry = { register: jest.fn(), unregister: jest.fn() };
    gateway = new NotificationsGateway(
      verifier as unknown as InternalTokenVerifierService,
      registry as unknown as SocketRegistryService,
    );
  });

  it('registers the socket under the verified userId when the token is valid (auth payload)', () => {
    verifier.verify.mockReturnValue({ userId: 'u1' });
    const socket = fakeSocket({ auth: { token: 'good-token' } });

    gateway.handleConnection(socket);

    expect(verifier.verify).toHaveBeenCalledWith('good-token');
    expect(registry.register).toHaveBeenCalledWith('u1', socket);
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('accepts a token passed via query string as a fallback', () => {
    verifier.verify.mockReturnValue({ userId: 'u1' });
    const socket = fakeSocket({ query: { token: 'good-token' } });

    gateway.handleConnection(socket);

    expect(registry.register).toHaveBeenCalledWith('u1', socket);
  });

  it('disconnects and does not register when no token is present', () => {
    const socket = fakeSocket({});

    gateway.handleConnection(socket);

    expect(verifier.verify).not.toHaveBeenCalled();
    expect(registry.register).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('disconnects and does not register when the token fails verification', () => {
    verifier.verify.mockImplementation(() => {
      throw new Error('invalid signature');
    });
    const socket = fakeSocket({ auth: { token: 'bad-token' } });

    gateway.handleConnection(socket);

    expect(registry.register).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('unregisters the socket on disconnect using the userId stashed at connect time', () => {
    const socket = fakeSocket({});
    socket.data.userId = 'u1';

    gateway.handleDisconnect(socket);

    expect(registry.unregister).toHaveBeenCalledWith('u1', socket);
  });

  it('does nothing on disconnect if the socket was never authenticated', () => {
    const socket = fakeSocket({});

    gateway.handleDisconnect(socket);

    expect(registry.unregister).not.toHaveBeenCalled();
  });
});
