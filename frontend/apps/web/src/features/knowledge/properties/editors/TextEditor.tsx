import { useEffect, useRef, useState } from 'react';
import { ExternalLinkIcon } from 'lucide-react';
import { cn } from '@nook/ui';
import { hrefForUrl, validateValue } from '../../lib/property-types';
import { emptyClass, valueCellClass, type EditorProps } from './types';

const DEBOUNCE_MS = 500;

/** text · number · url · email · phone — one input, validated per type, debounced commit. */
export function TextEditor({ prop, onChange, readOnly, name }: EditorProps) {
  const type = prop.type;
  const external = prop.value === null || prop.value === undefined ? '' : String(prop.value);
  const [draft, setDraft] = useState(external);
  const [error, setError] = useState<string | null>(null);
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync from the server when not editing.
  useEffect(() => {
    if (!focused.current) setDraft(external);
  }, [external]);

  const parse = (raw: string): { value: EditorProps['prop']['value']; error: string | null } => {
    const s = raw.trim();
    if (!s) return { value: null, error: null };
    if (type === 'number') {
      const n = Number.parseFloat(s.replace(/\s/g, '').replace(',', '.'));
      return Number.isFinite(n) ? { value: n, error: null } : { value: null, error: 'Enter a number' };
    }
    return { value: s, error: validateValue(type, s) };
  };

  const commit = (raw: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const { value, error: err } = parse(raw);
    setError(err);
    if (err) return;
    if (value !== (prop.value ?? null)) onChange(value);
  };

  const onInput = (raw: string) => {
    setDraft(raw);
    const { error: err } = parse(raw);
    setError(err);
    if (timer.current) clearTimeout(timer.current);
    if (!err) timer.current = setTimeout(() => commit(raw), DEBOUNCE_MS);
  };

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const isUrl = type === 'url' && typeof prop.value === 'string' && !validateValue('url', prop.value);
  const isEmail = type === 'email' && typeof prop.value === 'string' && !validateValue('email', prop.value);
  const isPhone = type === 'phone' && typeof prop.value === 'string' && !validateValue('phone', prop.value);
  const link = isUrl ? hrefForUrl(prop.value as string) : isEmail ? `mailto:${prop.value}` : isPhone ? `tel:${prop.value}` : null;

  if (readOnly)
    return (
      <div className={cn(valueCellClass, 'hover:bg-transparent')}>
        {link ? (
          <a href={link} target="_blank" rel="noreferrer noopener" className="truncate text-primary underline-offset-2 hover:underline">
            {external}
          </a>
        ) : (
          <span className={cn('truncate', !external && emptyClass)}>{external || 'Empty'}</span>
        )}
      </div>
    );

  return (
    <div className="flex w-full min-w-0 flex-col">
      <div className={cn(valueCellClass, 'gap-1', error && 'ring-1 ring-destructive/50')}>
        <input
          aria-label={name}
          aria-invalid={error ? true : undefined}
          value={draft}
          inputMode={type === 'number' ? 'decimal' : type === 'email' ? 'email' : type === 'phone' ? 'tel' : type === 'url' ? 'url' : 'text'}
          placeholder="Empty"
          onChange={(e) => onInput(e.target.value)}
          onFocus={() => (focused.current = true)}
          onBlur={() => {
            focused.current = false;
            commit(draft);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit(draft);
              (e.target as HTMLInputElement).blur();
            } else if (e.key === 'Escape') {
              setDraft(external);
              setError(null);
              (e.target as HTMLInputElement).blur();
            }
          }}
          className={cn('w-full min-w-0 bg-transparent outline-none placeholder:text-muted-foreground/70', type === 'number' && 'tabular-nums')}
        />
        {link ? (
          <a
            href={link}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="Open link"
            tabIndex={-1}
            className="shrink-0 rounded-sm p-0.5 text-muted-foreground hover:bg-accent-strong hover:text-foreground"
          >
            <ExternalLinkIcon className="size-3.5" />
          </a>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="px-1.5 pb-1 text-[11px] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
