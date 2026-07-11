import { cn } from '../lib/cn';

type SpinnerProps = {
  size?: 'sm' | 'md';
  label?: string;
};

const bySize = {
  sm: 'size-4',
  md: 'size-6',
} as const;

/* Quarter-arc SVG spinner: track circle at low opacity, one solid arc on
 * top, whole element rotates via CSS. currentColor so it inherits — white
 * inside a primary button, muted in an empty panel. */
export function Spinner({ size = 'md', label = 'Loading' }: SpinnerProps) {
  return (
    <span role="status" aria-label={label}>
      <svg
        className={cn('animate-spin', bySize[size])}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-90"
          d="M12 2a10 10 0 0 1 10 10"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
