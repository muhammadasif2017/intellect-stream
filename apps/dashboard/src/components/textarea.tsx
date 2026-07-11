import type { TextareaHTMLAttributes } from 'react';

import { cn } from '../lib/cn';

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean;
};

/* Same visual contract as Input (border, focus ring, invalid state) —
 * only the box model differs: multi-line, vertical resize only, so users
 * can't drag it sideways out of the layout. */
export function Textarea({ invalid = false, className, ...rest }: TextareaProps) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={cn(
        'min-h-24 w-full resize-y rounded-md border bg-surface px-3 py-2 text-sm text-foreground',
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
