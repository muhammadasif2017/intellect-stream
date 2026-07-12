import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { NotificationToasts } from './notification-toasts';
import type { ModerationNotification } from './use-moderation-notifications';

const approved: ModerationNotification = {
  id: 'n1',
  postId: 'p1',
  verdict: 'approved',
  categories: [],
};

const rejected: ModerationNotification = {
  id: 'n2',
  postId: 'p2',
  verdict: 'rejected',
  categories: ['spam', 'toxic'],
};

describe('NotificationToasts', () => {
  it('renders one toast per notification with its verdict', () => {
    render(
      <NotificationToasts
        notifications={[approved, rejected]}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getAllByRole('status')).toHaveLength(2);
    expect(screen.getByText('approved')).toBeTruthy();
    expect(screen.getByText('rejected')).toBeTruthy();
  });

  it('shows flagged categories only when present', () => {
    render(
      <NotificationToasts
        notifications={[approved, rejected]}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText('flagged: spam, toxic')).toBeTruthy();
    expect(screen.queryAllByText(/^flagged:/)).toHaveLength(1);
  });

  it('calls onDismiss with the toast id', async () => {
    const onDismiss = vi.fn();
    render(
      <NotificationToasts notifications={[approved]} onDismiss={onDismiss} />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Dismiss notification' }),
    );
    expect(onDismiss).toHaveBeenCalledWith('n1');
  });

  it('keeps the live region mounted when empty so announcements fire', () => {
    const { container } = render(
      <NotificationToasts notifications={[]} onDismiss={vi.fn()} />,
    );

    expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
  });
});
