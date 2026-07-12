import { useEffect, useRef, useState } from 'react';

import { apiFetch } from '../../lib/api';
import { createNotificationsSocket } from '../../lib/socket';

export interface ModerationNotification {
  id: string;
  postId: string;
  verdict: 'approved' | 'rejected';
  categories: string[];
}

/* Long enough to read a two-line toast, short enough that a burst of
 * verdicts doesn't wallpaper the screen. */
const AUTO_DISMISS_MS = 8_000;

/* Opens the notification-service WebSocket for the logged-in user and
 * collects `moderation.completed` pushes into toast state.
 *
 * Lives in the layout, not a page: the socket's lifetime should match the
 * session, not the route. Mounting it per-page would tear the socket down
 * on every navigation — and a verdict that lands mid-navigation would be
 * lost (the service is fire-and-forget; there is no replay). */
export function useModerationNotifications() {
  const [notifications, setNotifications] = useState<ModerationNotification[]>(
    [],
  );
  /* Timers live in a ref, not state — they're bookkeeping, and touching
   * state for them would re-render on every schedule/clear. */
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const socket = createNotificationsSocket(async () => {
      const { token } = await apiFetch<{ token: string }>(
        '/api/auth/notifications-ticket',
      );
      return token;
    });

    socket.on(
      'moderation.completed',
      (payload: { postId: string; verdict: string; categories: string[] }) => {
        const id = crypto.randomUUID();
        setNotifications((current) => [
          ...current,
          {
            id,
            postId: payload.postId,
            verdict: payload.verdict === 'approved' ? 'approved' : 'rejected',
            categories: payload.categories ?? [],
          },
        ]);
        const timer = setTimeout(() => {
          timers.current.delete(id);
          setNotifications((current) => current.filter((n) => n.id !== id));
        }, AUTO_DISMISS_MS);
        timers.current.set(id, timer);
      },
    );

    socket.connect();

    const pendingTimers = timers.current;
    return () => {
      socket.disconnect();
      for (const timer of pendingTimers.values()) clearTimeout(timer);
      pendingTimers.clear();
    };
  }, []);

  const dismiss = (id: string) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setNotifications((current) => current.filter((n) => n.id !== id));
  };

  return { notifications, dismiss };
}
