import { io, type Socket } from 'socket.io-client';

const notificationsUrl: string =
  import.meta.env.VITE_NOTIFICATIONS_URL ?? 'http://localhost:3004';

/* notification-service verifies a gateway-minted ticket once at the WS
 * handshake (ADR-0007, decision 21). `auth` is a callback, not a static
 * object, because socket.io runs it on EVERY handshake — including the
 * automatic reconnects after a service restart or network blip. The
 * ticket's TTL is 60s; a ticket captured at page load would fail any
 * reconnect after the first minute, silently killing notifications until
 * a full page refresh. Fetching fresh per handshake makes reconnects
 * self-healing.
 *
 * The key is `token` — it must match both what the gateway's ticket
 * endpoint returns ({ token }) and what NotificationsGateway reads at the
 * handshake (handshake.auth.token). */
export function createNotificationsSocket(
  fetchToken: () => Promise<string>,
): Socket {
  return io(notificationsUrl, {
    auth: (cb) => {
      fetchToken()
        .then((token) => cb({ token }))
        /* Ticket fetch failed (gateway down, session expired) — hand the
         * server an empty auth so it rejects cleanly; socket.io's backoff
         * will retry the whole handshake, ticket fetch included. */
        .catch(() => cb({}));
    },
    /* The consumer decides when to connect — a socket that dials the
     * moment the module is imported is untestable and races the session. */
    autoConnect: false,
  });
}
