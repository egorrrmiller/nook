import { useState } from 'react';
import { CalendarIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger, cn } from '@nook/ui';
import { formatValue, isDateRange, toIsoDay } from '../../lib/property-types';
import { Calendar } from './Calendar';
import { emptyClass, valueCellClass, type EditorProps } from './types';

export function DateEditor({ prop, onChange, readOnly, name }: EditorProps) {
  const value = isDateRange(prop.value) ? prop.value : null;
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState(!!value?.end);
  const label = formatValue(prop);
  const trigger = (
    <span className={cn('flex items-center gap-1.5 truncate', !label && emptyClass)}>
      {label ? <CalendarIcon className="size-3.5 shrink-0 text-muted-foreground" /> : null}
      {label || 'Empty'}
    </span>
  );
  if (readOnly) return <div className={cn(valueCellClass, 'hover:bg-transparent')}>{trigger}</div>;

  const pick = (day: string) => {
    if (!range || !value?.start || value.end) {
      onChange({ start: day });
      if (!range) setOpen(false);
      return;
    }
    // second click in range mode
    const [a, b] = day < value.start ? [day, value.start] : [value.start, day];
    onChange(a === b ? { start: a } : { start: a, end: b });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={name}
        data-testid="date-trigger"
        className={cn(valueCellClass, 'cursor-pointer text-left', open && 'bg-accent')}
      >
        {trigger}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" aria-label={`${name} date picker`}>
        <div className="mb-2 flex items-center gap-1 px-1">
          <input
            type="date"
            aria-label="Start date"
            value={value?.start.slice(0, 10) ?? ''}
            onChange={(e) => e.target.value && onChange({ start: e.target.value, ...(value?.end && value.end >= e.target.value ? { end: value.end } : {}) })}
            className="h-7 min-w-0 flex-1 rounded-sm border border-input bg-background px-1.5 text-xs outline-none focus-visible:border-primary"
          />
          {range ? (
            <>
              <span className="text-xs text-muted-foreground">→</span>
              <input
                type="date"
                aria-label="End date"
                value={value?.end?.slice(0, 10) ?? ''}
                min={value?.start.slice(0, 10)}
                onChange={(e) => value && onChange(e.target.value ? { start: value.start, end: e.target.value } : { start: value.start })}
                className="h-7 min-w-0 flex-1 rounded-sm border border-input bg-background px-1.5 text-xs outline-none focus-visible:border-primary"
              />
            </>
          ) : null}
        </div>
        <Calendar start={value?.start} end={value?.end} range={range} onSelect={pick} />
        <div className="mt-2 flex items-center gap-2 border-t border-border px-1 pt-2 text-xs">
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={range}
              onChange={(e) => {
                setRange(e.target.checked);
                if (!e.target.checked && value?.end) onChange({ start: value.start });
              }}
              className="accent-[var(--primary)]"
            />
            End date
          </label>
          <button type="button" onClick={() => onChange({ start: toIsoDay(new Date()) })} className="ml-auto rounded-sm px-1.5 py-0.5 hover:bg-accent">
            Today
          </button>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className="rounded-sm px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-destructive"
          >
            Clear
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
