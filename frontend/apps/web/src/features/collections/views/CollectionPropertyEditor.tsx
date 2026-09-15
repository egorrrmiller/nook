import { useEffect, useRef, useState } from 'react';
import { CalendarIcon, ExternalLinkIcon } from 'lucide-react';
import { Button, Checkbox, Input, Popover, PopoverContent, PopoverTrigger, cn } from '@nook/ui';
import type { CollectionPropertyDefinition, JsonValue } from '../model';
import { displayCollectionValue, isJsonRecord, propertyOptions } from '../model';
import { UnknownPropertyValue } from './UnknownPropertyValue';

const KNOWN_TYPES = new Set(['text', 'number', 'checkbox', 'date', 'select', 'multi_select', 'url', 'email', 'phone']);
const cellClass = 'flex min-h-8 w-full min-w-0 items-center rounded-sm px-2 py-1 text-sm text-fg transition-colors hover:bg-bg-hover focus-within:bg-bg-hover';

export interface CollectionPropertyEditorProps {
  property: CollectionPropertyDefinition;
  value: JsonValue | undefined;
  readOnly?: boolean;
  onCommit: (value: JsonValue) => void;
}

export function CollectionPropertyEditor({ property, value, readOnly, onCommit }: CollectionPropertyEditorProps) {
  if (!KNOWN_TYPES.has(property.type)) return <UnknownPropertyValue property={property} value={value} />;
  if (property.type === 'checkbox') {
    if (value !== undefined && value !== null && typeof value !== 'boolean') return <UnknownPropertyValue property={property} value={value} />;
    return (
      <label className={cn(cellClass, 'cursor-pointer gap-2', readOnly && 'cursor-default hover:bg-transparent')}>
        <Checkbox
          aria-label={property.name}
          checked={value === true}
          disabled={readOnly}
          onChange={(event) => onCommit(event.target.checked)}
        />
        <span className="text-xs text-fg-muted">{value === true ? 'Yes' : 'No'}</span>
      </label>
    );
  }
  if (property.type === 'date') return <DateCell property={property} value={value} readOnly={readOnly} onCommit={onCommit} />;
  if (property.type === 'select' || property.type === 'multi_select') {
    return <SelectCell property={property} value={value} readOnly={readOnly} onCommit={onCommit} />;
  }
  return <TextCell property={property} value={value} readOnly={readOnly} onCommit={onCommit} />;
}

function TextCell({ property, value, readOnly, onCommit }: CollectionPropertyEditorProps) {
  const external = displayCollectionValue(value);
  const [draft, setDraft] = useState(external);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(external);
  }, [external]);
  if (value !== undefined && value !== null && typeof value === 'object') return <UnknownPropertyValue property={property} value={value} />;
  const link = property.type === 'url' && external ? (external.includes('://') ? external : `https://${external}`) : null;
  const commit = (raw: string) => {
    const next = raw.trim();
    if (property.type === 'number') {
      if (!next) return onCommit(null);
      const n = Number.parseFloat(next.replace(',', '.'));
      if (Number.isFinite(n)) onCommit(n);
      return;
    }
    onCommit(next || null);
  };
  if (readOnly) {
    return (
      <div className={cn(cellClass, 'hover:bg-transparent')}>
        {link ? <a href={link} target="_blank" rel="noreferrer noopener" className="truncate text-primary hover:underline">{external}</a> : <span className={cn('truncate', !external && 'text-fg-muted')}>{external || 'Empty'}</span>}
      </div>
    );
  }
  return (
    <div className={cellClass}>
      <Input
        aria-label={property.name}
        value={draft}
        inputMode={property.type === 'number' ? 'decimal' : 'text'}
        placeholder="Empty"
        onChange={(event) => setDraft(event.target.value)}
        onFocus={() => (focused.current = true)}
        onBlur={() => { focused.current = false; commit(draft); }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); commit(draft); (event.target as HTMLInputElement).blur(); }
          if (event.key === 'Escape') { setDraft(external); (event.target as HTMLInputElement).blur(); }
        }}
        className="h-6 min-w-0 rounded-none border-0 bg-transparent px-0 shadow-none focus-visible:border-0 focus-visible:ring-0"
      />
      {link ? <a href={link} target="_blank" rel="noreferrer noopener" tabIndex={-1} aria-label="Open link" className="shrink-0 text-fg-muted"><ExternalLinkIcon className="size-3.5" /></a> : null}
    </div>
  );
}

function DateCell({ property, value, readOnly, onCommit }: CollectionPropertyEditorProps) {
  const date = isJsonRecord(value) && typeof value.start === 'string' ? value.start.slice(0, 10) : typeof value === 'string' ? value.slice(0, 10) : '';
  if (value !== undefined && value !== null && typeof value !== 'string' && !isJsonRecord(value)) return <UnknownPropertyValue property={property} value={value} />;
  if (isJsonRecord(value) && typeof value.start !== 'string') return <UnknownPropertyValue property={property} value={value} />;
  if (readOnly) return <div className={cn(cellClass, 'hover:bg-transparent')}><CalendarIcon className="mr-1.5 size-3.5 text-fg-muted" />{date || <span className="text-fg-muted">Empty</span>}</div>;
  return <div className={cellClass}><Input aria-label={property.name} type="date" value={date} onChange={(event) => onCommit(event.target.value ? { start: event.target.value } : null)} className="h-6 min-w-0 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0" /></div>;
}

function SelectCell({ property, value, readOnly, onCommit }: CollectionPropertyEditorProps) {
  const multi = property.type === 'multi_select';
  const selected = multi ? (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []) : typeof value === 'string' ? [value] : [];
  if (value !== undefined && value !== null && (multi ? !Array.isArray(value) : typeof value !== 'string')) return <UnknownPropertyValue property={property} value={value} />;
  const options = propertyOptions(property);
  if (!options.length) return <TextCell property={{ ...property, type: 'text' }} value={displayCollectionValue(value)} readOnly={readOnly} onCommit={(next) => onCommit(multi ? (typeof next === 'string' && next ? next.split(',').map((item) => item.trim()).filter(Boolean) : []) : next)} />;
  const label = selected.join(', ');
  if (readOnly) return <div className={cn(cellClass, 'hover:bg-transparent')}><span className={cn('truncate', !label && 'text-fg-muted')}>{label || 'Empty'}</span></div>;
  return (
    <Popover>
      <PopoverTrigger aria-label={property.name} className={cn(cellClass, 'cursor-pointer text-left')}>
        <span className={cn('truncate', !label && 'text-fg-muted')}>{label || 'Empty'}</span>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1" aria-label={`${property.name} options`}>
        {options.map((option) => {
          const checked = selected.includes(option);
          return (
            <Button
              key={option}
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start font-normal"
              onClick={() => {
                const next = multi ? (checked ? selected.filter((item) => item !== option) : [...selected, option]) : [option];
                onCommit(multi ? next : next[0] ?? null);
              }}
            >
              <Checkbox tabIndex={-1} checked={checked} readOnly />
              {option}
            </Button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

