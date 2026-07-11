import { render, screen } from '@testing-library/react';

import { Badge, type BadgeStatus } from './badge';

describe('Badge', () => {
  it.each<[BadgeStatus, string]>([
    ['pending', 'text-amber-700'],
    ['processing', 'text-blue-700'],
    ['delivered', 'text-emerald-700'],
    ['failed', 'text-red-700'],
    ['neutral', 'text-slate-600'],
  ])('maps %s to its hue', (status, expectedClass) => {
    render(<Badge status={status}>{status}</Badge>);
    expect(screen.getByText(status).className).toContain(expectedClass);
  });

  it('always renders the label text, never color alone', () => {
    render(<Badge status="failed">failed</Badge>);
    expect(screen.getByText('failed')).toBeTruthy();
  });
});
