import { createReactInlineContentSpec } from '@blocknote/react';
import { useEffect, useRef, useState } from 'react';
import { CalendarIcon } from 'lucide-react';

export const dateMentionConfig = {
  type: 'dateMention',
  propSchema: {
    /** ISO date (YYYY-MM-DD) or ISO date-time. */
    date: { default: '' },
    /** Optional end of a range. */
    end: { default: '' },
  },
  content: 'none',
} as const;

export function todayIso(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatDate(iso: string): string {
  if (!iso) return 'Date';
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const d = new Date(dateOnly ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  const today = todayIso();
  if (dateOnly) {
    if (iso === today) return 'Today';
    if (iso === todayIso(1)) return 'Tomorrow';
    if (iso === todayIso(-1)) return 'Yesterday';
  }
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
    ...(dateOnly ? {} : { hour: '2-digit', minute: '2-digit' }),
  });
}

/** Parses `@today`, `@tomorrow`, `@yesterday`, `@2026-09-13`, `@next week`… into an ISO date. */
export function parseDateQuery(q: string): string | null {
  const s = q.trim().toLowerCase();
  if (!s) return null;
  if (s === 'today' || s === 'now') return todayIso();
  if (s === 'tomorrow') return todayIso(1);
  if (s === 'yesterday') return todayIso(-1);
  if (s === 'next week') return todayIso(7);
  if (s === 'last week') return todayIso(-7);
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`;
  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const wd = weekdays.indexOf(s);
  if (wd >= 0) {
    const diff = (wd - new Date().getDay() + 7) % 7 || 7;
    return todayIso(diff);
  }
  return null;
}

function DateMentionView({
  date,
  end,
  editable,
  onChange,
}: {
  date: string;
  end: string;
  editable: boolean;
  onChange: (next: { date: string; end?: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as globalThis.Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <span className="nook-date" ref={root} data-testid="date-mention">
      <button
        type="button"
        className="nook-date__chip"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editable && setOpen((o) => !o)}
      >
        <CalendarIcon size={12} />
        {formatDate(date)}
        {end ? ` → ${formatDate(end)}` : ''}
      </button>
      {open ? (
        <span className="nook-date__popover" role="dialog" aria-label="Pick a date">
          <label>
            Date
            <input type="date" value={date.slice(0, 10)} onChange={(e) => onChange({ date: e.target.value, end })} />
          </label>
          <label>
            End
            <input type="date" value={end.slice(0, 10)} onChange={(e) => onChange({ date, end: e.target.value })} />
          </label>
          <span className="nook-date__quick">
            <button type="button" onClick={() => onChange({ date: todayIso(), end })}>
              Today
            </button>
            <button type="button" onClick={() => onChange({ date: todayIso(1), end })}>
              Tomorrow
            </button>
            <button type="button" onClick={() => onChange({ date, end: '' })}>
              Clear end
            </button>
          </span>
        </span>
      ) : null}
    </span>
  );
}

/** Date mention (`@today`, date picker). Plain ISO strings in props (§4). */
export const DateMentionInline = createReactInlineContentSpec(dateMentionConfig, {
  render: ({ inlineContent, updateInlineContent, editor }) => (
    <DateMentionView
      date={inlineContent.props.date}
      end={inlineContent.props.end}
      editable={editor.isEditable}
      onChange={({ date, end }) => updateInlineContent({ type: 'dateMention', props: { date, end: end ?? '' } })}
    />
  ),
  toExternalHTML: ({ inlineContent }) => (
    <time dateTime={inlineContent.props.date} className="nook-date">
      {formatDate(inlineContent.props.date)}
    </time>
  ),
});
