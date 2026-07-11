import type { ReactNode } from 'react';

import { cn } from '../lib/cn';

export type BadgeStatus =
  | 'pending'
  | 'processing'
  | 'delivered'
  | 'failed'
  | 'neutral';

type BadgeProps = {
  status: BadgeStatus;
  children: ReactNode;
};

/* Tinted background + dark text of the same hue, plus a solid dot.
 * The dot carries the raw status hue; the text stays readable. */
const byStatus = {
  pending: { chip: 'bg-amber-50 text-amber-700', dot: 'bg-status-pending' },
  processing: { chip: 'bg-blue-50 text-blue-700', dot: 'bg-status-processing' },
  delivered: {
    chip: 'bg-emerald-50 text-emerald-700',
    dot: 'bg-status-delivered',
  },
  failed: { chip: 'bg-red-50 text-red-700', dot: 'bg-status-failed' },
  neutral: { chip: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
} as const;

export function Badge({ status, children }: BadgeProps) {
  const { chip, dot } = byStatus[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        chip,
      )}
    >
      <span aria-hidden className={cn('size-1.5 rounded-full', dot)} />
      {children}
    </span>
  );
}
