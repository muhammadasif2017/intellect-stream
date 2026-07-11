import { io, type Socket } from 'socket.io-client';

const notificationsUrl: string =
  import.meta.env.VITE_NOTIFICATIONS_URL ?? 'http://localhost:3004';

/* notification-service verifies a gateway-minted ticket once at the WS
 * handshake (ADR-0007). The caller fetches the ticket first, then connects.
 * autoConnect: false so the consumer controls when the handshake happens. */
export function createNotificationsSocket(ticket: string): Socket {
  return io(notificationsUrl, {
    auth: { ticket },
    autoConnect: false,
  });
}
