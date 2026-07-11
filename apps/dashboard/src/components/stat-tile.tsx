import { cn } from '../lib/cn';

type StatTileProps = {
  label: string;
  value: string | number;
  /* danger: the value itself is a bad state (e.g. quarantined > 0) —
   * status color is reserved for state, never decoration. */
  tone?: 'default' | 'danger';
  hint?: string;
};

/* Stat tile contract (dataviz skill): sentence-case label, no colon;
 * semibold sans value; tabular-nums so refreshing digits don't wiggle. */
export function StatTile({
  label,
  value,
  tone = 'default',
  hint,
}: StatTileProps) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 text-2xl font-semibold tracking-tight tabular-nums',
          tone === 'danger' && 'text-status-failed',
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
