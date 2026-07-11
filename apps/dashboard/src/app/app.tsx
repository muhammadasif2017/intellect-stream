const statuses = [
  { label: 'pending', className: 'bg-status-pending' },
  { label: 'processing', className: 'bg-status-processing' },
  { label: 'delivered', className: 'bg-status-delivered' },
  { label: 'failed', className: 'bg-status-failed' },
];

/* Temporary token-proof page — replaced by the app shell in T3. */
export function App() {
  return (
    <main className="min-h-screen bg-background p-8 font-sans text-foreground">
      <h1 className="text-2xl font-semibold tracking-tight">
        IntellectStream Dashboard
      </h1>
      <p className="mt-2 text-muted-foreground">
        Tailwind v4 wired. Design tokens active.
      </p>

      <section className="mt-8 max-w-md rounded-lg border border-border bg-surface p-6">
        <h2 className="text-sm font-medium text-muted-foreground">
          Status hues
        </h2>
        <ul className="mt-4 flex gap-6">
          {statuses.map(({ label, className }) => (
            <li key={label} className="flex items-center gap-2">
              <span className={`size-3 rounded-full ${className}`} />
              <span className="font-mono text-sm">{label}</span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-strong"
        >
          Primary action
        </button>
      </section>
    </main>
  );
}
export default App;
