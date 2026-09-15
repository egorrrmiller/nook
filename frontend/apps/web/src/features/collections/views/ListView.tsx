import { ChevronRightIcon } from 'lucide-react';
import type { CollectionPropertyDefinition, CollectionRow, CollectionViewConfig } from '../model';
import { displayCollectionValue } from '../model';

export function ListView({ properties, rows, config, onOpenRow }: { properties: CollectionPropertyDefinition[]; rows: CollectionRow[]; config: CollectionViewConfig; onOpenRow: (row: CollectionRow) => void }) {
  const columns = config.visiblePropertyIds.map((id) => properties.find((property) => property.id === id)).filter(Boolean) as CollectionPropertyDefinition[];
  return (
    <div data-testid="collection-list-view" className="divide-y divide-border rounded-lg border border-border bg-bg">
      {rows.map((row) => <button key={row.id} type="button" onClick={() => onOpenRow(row)} className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-bg-hover"><span className="size-6 shrink-0 rounded bg-bg-subtle text-center leading-6" aria-hidden>{row.icon?.type === 'emoji' ? row.icon.value : '▧'}</span><span className="min-w-40 flex-1 truncate text-sm font-medium">{row.title || 'Untitled'}</span><span className="flex min-w-0 gap-2 text-xs text-fg-muted">{columns.slice(0, 3).map((property) => <span key={property.id} className="max-w-36 truncate">{displayCollectionValue(row.properties[property.id])}</span>)}</span><ChevronRightIcon className="size-4 shrink-0 text-fg-muted" /></button>)}
      {!rows.length ? <p className="px-4 py-10 text-center text-sm text-fg-muted">No rows match this view.</p> : null}
    </div>
  );
}

