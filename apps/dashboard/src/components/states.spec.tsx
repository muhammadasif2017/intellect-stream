import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { EmptyState } from './empty-state';
import { ErrorState } from './error-state';

describe('EmptyState', () => {
  it('renders title, description, and action', () => {
    render(
      <EmptyState
        title="No logs yet"
        description="Trigger a post to see logs."
        action={<button>Go to Trigger</button>}
      />,
    );
    expect(screen.getByText('No logs yet')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Go to Trigger' })).toBeTruthy();
  });
});

describe('ErrorState', () => {
  it('announces as an alert and shows the detail', () => {
    render(<ErrorState detail="fetch failed: 502" />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('fetch failed: 502')).toBeTruthy();
  });

  it('calls onRetry when the retry button is clicked', async () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('omits the retry button without a handler', () => {
    render(<ErrorState />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
