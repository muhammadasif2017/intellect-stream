import { Injectable, Logger } from '@nestjs/common';
import type { Socket } from 'socket.io';

// Decision 20: in-memory registry, single instance. One user may have several
// live sockets (phone + laptop) — a Set, not a single socket, per user.
@Injectable()
export class SocketRegistryService {
  private readonly logger = new Logger(SocketRegistryService.name);
  private readonly sockets = new Map<string, Set<Socket>>();

  register(userId: string, socket: Socket): void {
    const existing = this.sockets.get(userId);
    if (existing) {
      existing.add(socket);
      return;
    }
    this.sockets.set(userId, new Set([socket]));
    this.logger.debug(`Registered first socket for user ${userId}`);
  }

  unregister(userId: string, socket: Socket): void {
    const existing = this.sockets.get(userId);
    if (!existing) {
      return;
    }
    existing.delete(socket);
    if (existing.size === 0) {
      this.sockets.delete(userId);
    }
  }

  getSockets(userId: string): Socket[] {
    return Array.from(this.sockets.get(userId) ?? []);
  }
}
