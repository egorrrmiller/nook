import { useCallback, useEffect, useState } from 'react';
import type * as Y from 'yjs';

/** Two-way binding to a Y.Text. `set` replaces the whole string in one transaction. */
export function useYText(text: Y.Text, onLocalChange?: (value: string) => void) {
  const [value, setValue] = useState(() => text.toString());

  useEffect(() => {
    setValue(text.toString());
    const handler = (_e: Y.YTextEvent, tr: Y.Transaction) => {
      const v = text.toString();
      setValue(v);
      if (tr.local) onLocalChange?.(v);
    };
    text.observe(handler);
    return () => text.unobserve(handler);
  }, [text, onLocalChange]);

  const set = useCallback(
    (next: string) => {
      if (next === text.toString()) return;
      text.doc?.transact(() => {
        text.delete(0, text.length);
        if (next) text.insert(0, next);
      });
    },
    [text],
  );

  return [value, set] as const;
}
