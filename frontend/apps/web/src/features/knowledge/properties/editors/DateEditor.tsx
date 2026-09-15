import { useState } from 'react';
import { CalendarIcon } from 'lucide-react';
import { Button, Checkbox, Input, Popover, PopoverContent, PopoverTrigger, cn } from '@nook/ui';
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
          <Input
            type="date"
            aria-label="Start date"
            value={value?.start.slice(0, 10) ?? ''}
            onChange={(e) => e.target.value && onChange({ start: e.target.value, ...(value?.end && value.end >= e.target.value ? { end: value.end } : {}) })}
            className="h-7 min-w-0 flex-1 rounded-sm px-1.5 text-xs"
          />
          {range ? (
            <>
              <span className="text-xs text-muted-foreground">→</span>
              <Input
                type="date"
                aria-label="End date"
                value={value?.end?.slice(0, 10) ?? ''}
                min={value?.start.slice(0, 10)}
                onChange={(e) => value && onChange(e.target.value ? { start: value.start, end: e.target.value } : { start: value.start })}
                className="h-7 min-w-0 flex-1 rounded-sm px-1.5 text-xs"
              />
            </>
          ) : null}
        </div>
        <Calendar start={value?.start} end={value?.end} range={range} onSelect={pick} />
        <div className="mt-2 flex items-center gap-2 border-t border-border px-1 pt-2 text-xs">
          <label className="flex cursor-pointer items-center gap-1.5">
            <Checkbox
              checked={range}
              onChange={(e) => {
                setRange(e.target.checked);
                if (!e.target.checked && value?.end) onChange({ start: value.start });
              }}
            />
            End date
          </label>
          <Button type="button" variant="subtle" size="xs" onClick={() => onChange({ start: toIsoDay(new Date()) })} className="ml-auto font-normal">
            Today
          </Button>
          <Button
            type="button"
            variant="subtle"
            size="xs"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className="font-normal text-muted-foreground hover:text-destructive"
          >
            Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
