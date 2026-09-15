import { CalendarDaysIcon } from 'lucide-react';
import type { CollectionPropertyDefinition, CollectionRow, CollectionViewConfig } from '../model';
import { displayCollectionValue, isJsonRecord } from '../model';

function dateFor(row: CollectionRow, propertyId: string | undefined): string {
  if (!propertyId) return '';
  const value = row.properties[propertyId];
  if (typeof value === 'string') return value.slice(0, 10);
  if (isJsonRecord(value) && typeof value.start === 'string') return value.start.slice(0, 10);
  return '';
}

export function CalendarView({ properties, rows, config, onOpenRow }: { properties: CollectionPropertyDefinition[]; rows: CollectionRow[]; config: CollectionViewConfig; onOpenRow: (row: CollectionRow) => void }) {
  const dateProperty = properties.find((property) => property.type === 'date' && config.visiblePropertyIds.includes(property.id)) ?? properties.find((property) => property.type === 'date');
  const sorted = [...rows].sort((a, b) => dateFor(a, dateProperty?.id).localeCompare(dateFor(b, dateProperty?.id)));
  return (
    <div data-testid="collection-calendar-view" className="rounded-lg border border-border bg-bg">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-medium"><CalendarDaysIcon className="size-4 text-fg-muted" />{dateProperty ? `By ${dateProperty.name}` : 'Calendar'}</div>
      <div className="divide-y divide-border">{sorted.map((row) => <button key={row.id} type="button" onClick={() => onOpenRow(row)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-bg-hover"><span className="w-28 shrink-0 text-xs tabular-nums text-fg-muted">{dateFor(row, dateProperty?.id) || 'No date'}</span><span className="truncate text-sm font-medium">{row.title || 'Untitled'}</span><span className="ml-auto max-w-48 truncate text-xs text-fg-muted">{dateProperty ? displayCollectionValue(row.properties[dateProperty.id]) : ''}</span></button>)}</div>
      {!rows.length ? <p className="px-4 py-10 text-center text-sm text-fg-muted">No rows match this view.</p> : null}
    </div>
  );
}

