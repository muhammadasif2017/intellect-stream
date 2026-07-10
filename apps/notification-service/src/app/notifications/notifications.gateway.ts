import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Socket } from 'socket.io';
import { InternalTokenVerifierService } from '../auth/internal-token-verifier.service';
import { SocketRegistryService } from '../registry/socket-registry.service';

// Decision 21: auth-on-connect only, via the same gateway-signed internal
// token used for REST (ADR-0007). Verified once at handshake — the token's
// 60s TTL only has to survive the handshake, not the connection's lifetime,
// same as a session cookie authenticates one request. No re-verification for
// the life of the socket (logged trade-off, decision 21).
@WebSocketGateway({ cors: true })
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(
    private readonly tokenVerifier: InternalTokenVerifierService,
    private readonly registry: SocketRegistryService,
  ) {}

  handleConnection(client: Socket): void {
    const token = this.extractToken(client);
    if (!token) {
      this.logger.warn(`Connection ${client.id} rejected: missing token`);
      client.disconnect(true);
      return;
    }

    try {
      const { userId } = this.tokenVerifier.verify(token);
      client.data.userId = userId;
      this.registry.register(userId, client);
    } catch {
      this.logger.warn(`Connection ${client.id} rejected: invalid token`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const userId = client.data.userId as string | undefined;
    if (userId) {
      this.registry.unregister(userId, client);
    }
  }

  private extractToken(client: Socket): string | undefined {
    const fromAuth = client.handshake.auth?.['token'];
    const fromQuery = client.handshake.query?.['token'];
    return (fromAuth ?? fromQuery) as string | undefined;
  }
}
