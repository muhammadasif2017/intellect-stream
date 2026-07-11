import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';

import { cn } from '../lib/cn';

/* Wrapper owns horizontal overflow: wide data scrolls inside the card,
 * never blows the page open (pairs with min-w-0 on <main>, see T3). */
export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead>{children}</thead>;
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-border">{children}</tbody>;
}

export function Tr({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cn('hover:bg-background', className)} {...rest}>
      {children}
    </tr>
  );
}

export function Th({
  className,
  children,
  ...rest
}: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'border-b border-border px-3 py-2 text-left text-xs font-medium text-muted-foreground',
        className,
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

export function Td({
  className,
  children,
  ...rest
}: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn('px-3 py-2 align-top', className)} {...rest}>
      {children}
    </td>
  );
}
