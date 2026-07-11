import { useEffect, useRef, useState } from 'react';

export type SseStatus = 'idle' | 'connecting' | 'open' | 'error';

/* EventSource lifecycle in a hook. Pass url=null to stay disconnected
 * (stream paused). EventSource reconnects by itself after errors — the
 * status only *reports* the connection so the UI can show a banner;
 * the hook never tears down and re-dials on its own. */
export function useSse<T>(url: string | null, onMessage: (data: T) => void) {
  const [status, setStatus] = useState<SseStatus>(url ? 'connecting' : 'idle');
  /* Latest-callback ref: consumers pass inline closures; re-subscribing
   * the EventSource on every render would drop the stream. */
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!url) {
      setStatus('idle');
      return;
    }
    setStatus('connecting');
    const source = new EventSource(url, { withCredentials: true });

    source.onopen = () => setStatus('open');
    source.onerror = () => setStatus('error');
    source.onmessage = (event) => {
      try {
        onMessageRef.current(JSON.parse(event.data) as T);
      } catch {
        /* malformed frame — skip it, keep the stream alive */
      }
    };

    return () => source.close();
  }, [url]);

  return { status };
}
