import { act, renderHook } from '@testing-library/react';

import { useSse } from './use-sse';

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  closed = false;

  constructor(
    readonly url: string,
    readonly init?: EventSourceInit,
  ) {
    FakeEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
  }
}

describe('useSse', () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stays idle when url is null', () => {
    const { result } = renderHook(() => useSse(null, vi.fn()));
    expect(result.current.status).toBe('idle');
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it('reports connecting → open', () => {
    const { result } = renderHook(() => useSse('/dev/logs/stream', vi.fn()));
    expect(result.current.status).toBe('connecting');
    act(() => FakeEventSource.instances[0].onopen?.());
    expect(result.current.status).toBe('open');
  });

  it('parses JSON frames and skips malformed ones', () => {
    const onMessage = vi.fn();
    renderHook(() => useSse('/dev/logs/stream', onMessage));
    const source = FakeEventSource.instances[0];
    act(() => {
      source.onmessage?.({ data: '{"level":"error"}' });
      source.onmessage?.({ data: 'not json' });
    });
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith({ level: 'error' });
  });

  it('reports errors without closing the stream', () => {
    const { result } = renderHook(() => useSse('/dev/logs/stream', vi.fn()));
    act(() => FakeEventSource.instances[0].onerror?.());
    expect(result.current.status).toBe('error');
    expect(FakeEventSource.instances[0].closed).toBe(false);
  });

  it('closes the stream on unmount', () => {
    const { unmount } = renderHook(() => useSse('/dev/logs/stream', vi.fn()));
    unmount();
    expect(FakeEventSource.instances[0].closed).toBe(true);
  });
});
