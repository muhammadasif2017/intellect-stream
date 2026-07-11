import { NavLink, Outlet } from 'react-router-dom';

const navItems = [
  { to: '/status', label: 'Status' },
  { to: '/trigger', label: 'Trigger' },
  { to: '/logs', label: 'Logs' },
  { to: '/trace', label: 'Trace' },
  { to: '/analytics', label: 'Analytics' },
];

export function Layout() {
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
        <nav
          aria-label="Development"
          className="hidden border-t border-border md:mt-auto md:block"
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
    </div>
  );
}
