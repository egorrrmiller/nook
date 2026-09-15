import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import type * as Y from 'yjs';
import { Textarea } from '@nook/ui';

export interface TitleEditorProps {
  text: Y.Text;
  /** Server-side title used to seed an empty Y.Text once (contracts §3: title lives in the Y.Doc). */
  initialTitle?: string;
  /** Called after every local or remote change (the app mirrors it to `PATCH /api/nodes/{id}`). */
  onChange?: (title: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  seedWhen?: boolean;
  onEnter?: () => void;
  autoFocus?: boolean;
  className?: string;
}

/** Replaces only the changed middle span so concurrent title edits merge per character. */
export function applyTextDiff(text: Y.Text, next: string) {
  const prev = text.toString();
  if (prev === next) return;
  let start = 0;
  while (start < prev.length && start < next.length && prev[start] === next[start]) start++;
  let endPrev = prev.length;
  let endNext = next.length;
  while (endPrev > start && endNext > start && prev[endPrev - 1] === next[endNext - 1]) {
    endPrev--;
    endNext--;
  }
  text.doc?.transact(() => {
    if (endPrev > start) text.delete(start, endPrev - start);
    if (endNext > start) text.insert(start, next.slice(start, endNext));
  });
}

export function TitleEditor({
  text,
  initialTitle,
  onChange,
  readOnly,
  placeholder = 'Untitled',
  seedWhen = true,
  onEnter,
  autoFocus,
  className,
}: TitleEditorProps) {
  const [value, setValue] = useState(() => text.toString());
  const ref = useRef<HTMLTextAreaElement>(null);
  const seeded = useRef(false);

  useEffect(() => {
    const observer = () => {
      const v = text.toString();
      setValue(v);
      onChange?.(v);
    };
    text.observe(observer);
    setValue(text.toString());
    return () => text.unobserve(observer);
  }, [text, onChange]);

  useEffect(() => {
    if (seeded.current || !seedWhen) return;
    seeded.current = true;
    if (text.length === 0 && initialTitle) applyTextDiff(text, initialTitle);
  }, [seedWhen, initialTitle, text]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onEnter?.();
    }
  };

  return (
    <Textarea
      ref={ref}
      className={['nook-editor__title', className].filter(Boolean).join(' ')}
      rows={1}
      value={value}
      placeholder={placeholder}
      readOnly={readOnly}
      autoFocus={autoFocus}
      aria-label="Page title"
      data-testid="page-title"
      onChange={(e) => applyTextDiff(text, e.target.value.replace(/\n/g, ' '))}
      onKeyDown={onKeyDown}
    />
  );
}
