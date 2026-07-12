import { Badge } from '../../components';

import type { ModerationNotification } from './use-moderation-notifications';

type NotificationToastsProps = {
  notifications: ModerationNotification[];
  onDismiss: (id: string) => void;
};

/* Toast stack for moderation verdicts. Purely presentational — state and
 * socket wiring live in useModerationNotifications, so this renders (and
 * tests) with plain props.
 *
 * aria-live="polite" on the container: screen readers announce new toasts
 * without interrupting whatever they're mid-way through. The container is
 * always mounted (even empty) — live regions only announce content that
 * appears INSIDE an existing region; mounting the region together with its
 * first toast would swallow the announcement. */
export function NotificationToasts({
  notifications,
  onDismiss,
}: NotificationToastsProps) {
  return (
    <div
      aria-live="polite"
      className="fixed right-4 bottom-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
    >
      {notifications.map((n) => (
        <div
          key={n.id}
          role="status"
          className="rounded-lg border border-border bg-surface p-3 shadow-lg"
        >
          <div className="flex items-start justify-between gap-2">
            <Badge status={n.verdict === 'approved' ? 'delivered' : 'failed'}>
              {n.verdict}
            </Badge>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => onDismiss(n.id)}
              className="-m-1 rounded p-1 leading-none text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              ×
            </button>
          </div>
          <p className="mt-1.5 text-sm">
            Moderation finished for post{' '}
            <span className="font-mono text-xs">{n.postId}</span>
          </p>
          {n.categories.length > 0 && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              flagged: {n.categories.join(', ')}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
