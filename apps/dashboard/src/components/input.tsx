import type { InputHTMLAttributes } from 'react';

import { cn } from '../lib/cn';

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
};

export function Input({ invalid = false, className, ...rest }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(
        'h-9 w-full rounded-md border bg-surface px-3 text-sm text-foreground',
        'placeholder:text-muted-foreground',
        'focus-visible:outline-2 focus-visible:outline-offset-2',
        'disabled:pointer-events-none disabled:opacity-50',
        invalid
          ? 'border-status-failed focus-visible:outline-status-failed'
          : 'border-border focus-visible:outline-primary',
        className,
      )}
      {...rest}
    />
  );
}
