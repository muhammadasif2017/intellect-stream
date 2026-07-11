import { cn } from '../lib/cn';

/* Shape is caller-supplied via className (h-4 w-32, size-8 rounded-full …)
 * so skeletons mirror the real content's layout and nothing jumps when
 * data arrives. aria-hidden: screen readers get the container's loading
 * state (Spinner / aria-busy), not a pile of gray boxes. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-md bg-border/70', className)}
    />
  );
}
