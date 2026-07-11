import type { SelectHTMLAttributes } from 'react';

import { cn } from '../lib/cn';

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  invalid?: boolean;
};

/* Native <select> under custom skin: appearance-none kills the platform
 * chrome, an inline SVG chevron replaces it. The dropdown list itself stays
 * OS-native — keyboard, screen readers, mobile pickers all free. */
export function Select({
  invalid = false,
  className,
  children,
  ...rest
}: SelectProps) {
  return (
    <span className="relative inline-block w-full">
      <select
        aria-invalid={invalid || undefined}
        className={cn(
          'h-9 w-full appearance-none rounded-md border bg-surface pr-8 pl-3 text-sm text-foreground',
          'focus-visible:outline-2 focus-visible:outline-offset-2',
          'disabled:pointer-events-none disabled:opacity-50',
          invalid
            ? 'border-status-failed focus-visible:outline-status-failed'
            : 'border-border focus-visible:outline-primary',
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        fill="none"
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      >
        <path
          d="M4 6l4 4 4-4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
