import { useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { cn } from '@nook/ui';
import { toIsoDay } from '../../lib/property-types';

export interface CalendarProps {
  start?: string | null;
  end?: string | null;
  /** When true the second click sets the end of the range. */
  range: boolean;
  onSelect: (day: string) => void;
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

function parseDay(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Month grid with a range highlight. Notion-sized (7 × ~28px). */
export function Calendar({ start, end, range, onSelect }: CalendarProps) {
  const today = toIsoDay(new Date());
  const initial = parseDay(start) ?? new Date();
  const [view, setView] = useState({ y: initial.getFullYear(), m: initial.getMonth() });
  const first = new Date(view.y, view.m, 1);
  const offset = (first.getDay() + 6) % 7; // Monday first
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(toIsoDay(new Date(view.y, view.m, d)));
  while (cells.length % 7) cells.push(null);
  const s = start?.slice(0, 10) ?? null;
  const e = end?.slice(0, 10) ?? null;

  return (
    <div className="w-[252px] select-none" data-testid="calendar">
      <div className="mb-1 flex items-center justify-between px-1">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => setView((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }))}
          className="rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ChevronLeftIcon className="size-4" />
        </button>
        <span className="text-sm font-medium">{monthFmt.format(first)}</span>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => setView((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }))}
          className="rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ChevronRightIcon className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] text-muted-foreground">
        {WEEKDAYS.map((w) => (
          <span key={w} className="py-1">
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          if (!day) return <span key={i} />;
          const isStart = day === s;
          const isEnd = day === e;
          const inRange = range && s && e && day > s && day < e;
          return (
            <button
              key={day}
              type="button"
              aria-label={day}
              aria-pressed={isStart || isEnd || undefined}
              onClick={() => onSelect(day)}
              className={cn(
                'mx-auto my-px flex size-7 items-center justify-center rounded-sm text-[13px] tabular-nums hover:bg-accent',
                inRange && 'bg-[color-mix(in_srgb,var(--primary)_14%,transparent)]',
                (isStart || isEnd) && 'bg-primary text-primary-foreground hover:bg-primary',
                day === today && !isStart && !isEnd && 'font-semibold text-primary',
              )}
            >
              {Number(day.slice(8, 10))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
