import type { ButtonHTMLAttributes } from 'react';

import { cn } from '../lib/cn';
import { Spinner } from './spinner';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  isLoading?: boolean;
};

const base =
  'inline-flex items-center justify-center gap-2 rounded-md font-medium ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ' +
  'disabled:pointer-events-none disabled:opacity-50';

const byVariant = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary-strong',
  secondary: 'border border-border bg-surface text-foreground hover:bg-background',
  ghost: 'text-foreground hover:bg-border/50',
  danger: 'bg-red-600 text-white hover:bg-red-700',
} as const;

const bySize = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-9 px-4 text-sm',
} as const;

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || isLoading}
      className={cn(base, byVariant[variant], bySize[size], className)}
      {...rest}
    >
      {isLoading && <Spinner size="sm" />}
      {children}
    </button>
  );
}
