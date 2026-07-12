import { act, renderHook } from '@testing-library/react';

import { useModerationNotifications } from './use-moderation-notifications';

/* The hook's contract with the socket layer: register a listener, connect,
 * disconnect on unmount. The fake captures the listener so tests can push
 * events as if the server emitted them. */
const socketMock = {
  on: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
};

vi.mock('../../lib/socket', () => ({
  createNotificationsSocket: vi.fn(() => socketMock),
}));

function emitFromServer(payload: unknown) {
  const handler = socketMock.on.mock.calls.find(
    ([event]) => event === 'moderation.completed',
  )?.[1] as (p: unknown) => void;
  act(() => handler(payload));
}

describe('useModerationNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('connects on mount and disconnects on unmount', () => {
    const { unmount } = renderHook(() => useModerationNotifications());

    expect(socketMock.connect).toHaveBeenCalled();
    unmount();
    expect(socketMock.disconnect).toHaveBeenCalled();
  });

  it('turns a moderation.completed push into a notification', () => {
    const { result } = renderHook(() => useModerationNotifications());

    emitFromServer({ postId: 'p1', verdict: 'approved', categories: [] });

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0]).toMatchObject({
      postId: 'p1',
      verdict: 'approved',
    });
  });

  it('auto-dismisses a notification after the timeout', () => {
    const { result } = renderHook(() => useModerationNotifications());

    emitFromServer({ postId: 'p1', verdict: 'rejected', categories: ['spam'] });
    expect(result.current.notifications).toHaveLength(1);

    act(() => vi.advanceTimersByTime(8_000));
    expect(result.current.notifications).toHaveLength(0);
  });

  it('dismisses manually by id', () => {
    const { result } = renderHook(() => useModerationNotifications());

    emitFromServer({ postId: 'p1', verdict: 'approved', categories: [] });
    const id = result.current.notifications[0].id;

    act(() => result.current.dismiss(id));
    expect(result.current.notifications).toHaveLength(0);
  });
});
