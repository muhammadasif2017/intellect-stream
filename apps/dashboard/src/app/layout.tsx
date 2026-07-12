import { NavLink, Outlet } from 'react-router-dom';

import { Button } from '../components';
import { useLogout, useMe } from '../features/auth/use-auth';
import { NotificationToasts } from '../features/notifications/notification-toasts';
import { useModerationNotifications } from '../features/notifications/use-moderation-notifications';

const navItems = [
  { to: '/status', label: 'Status' },
  { to: '/trigger', label: 'Trigger' },
  { to: '/logs', label: 'Logs' },
  { to: '/trace', label: 'Trace' },
  { to: '/analytics', label: 'Analytics' },
];

export function Layout() {
  const { data: user } = useMe();
  const logout = useLogout();
  /* Socket lives here (inside AuthGate, above all routes) so its lifetime
   * matches the session — pushes arrive no matter which page is open. */
  const { notifications, dismiss } = useModerationNotifications();

  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground md:flex-row">
      <aside className="border-b border-border bg-surface md:sticky md:top-0 md:flex md:h-screen md:w-56 md:shrink-0 md:flex-col md:border-b-0 md:border-r">
        <div className="px-4 pt-4 md:pt-6">
          <p className="text-sm font-semibold tracking-tight">
            IntellectStream
          </p>
          <p className="text-xs text-muted-foreground">Pipeline Dashboard</p>
        </div>
        <nav aria-label="Primary">
          <ul className="flex gap-1 overflow-x-auto p-2 md:flex-col md:p-3">
            {navItems.map(({ to, label }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  className={({ isActive }) =>
                    [
                      'block rounded-md px-3 py-1.5 text-sm whitespace-nowrap',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                      isActive
                        ? 'bg-primary/10 font-medium text-primary'
                        : 'text-muted-foreground hover:bg-background hover:text-foreground',
                    ].join(' ')
                  }
                >
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="hidden items-center justify-between gap-2 border-t border-border px-4 py-2.5 md:mt-auto md:flex">
          <p
            className="truncate text-xs text-muted-foreground"
            title={user?.email}
          >
            {user?.email}
          </p>
          <Button
            variant="ghost"
            size="sm"
            isLoading={logout.isPending}
            onClick={() => logout.mutate()}
          >
            Log out
          </Button>
        </div>
        <nav
          aria-label="Development"
          className="hidden border-t border-border md:block"
        >
          <div className="p-3">
            <NavLink
              to="/kitchen-sink"
              className={({ isActive }) =>
                [
                  'block rounded-md px-3 py-1.5 text-xs',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                  isActive
                    ? 'bg-primary/10 font-medium text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                ].join(' ')
              }
            >
              Kitchen sink
            </NavLink>
          </div>
        </nav>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">
        <Outlet />
      </main>
      <NotificationToasts notifications={notifications} onDismiss={dismiss} />
    </div>
  );
}
