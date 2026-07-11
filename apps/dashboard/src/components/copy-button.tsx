import { useEffect, useRef, useState } from 'react';

import { Button } from './button';

/* Feedback lives in the button itself ("Copy" → "Copied") — a toast for a
 * clipboard write is a cannon for a fly. Reverts after 1.5s so the button
 * is reusable without a page interaction. */
export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Button variant="ghost" size="sm" onClick={copy}>
      {copied ? 'Copied' : label}
    </Button>
  );
}
