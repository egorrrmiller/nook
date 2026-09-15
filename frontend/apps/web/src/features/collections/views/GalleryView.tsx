import { ImageIcon } from 'lucide-react';
import type { CollectionPropertyDefinition, CollectionRow, CollectionViewConfig } from '../model';
import { displayCollectionValue } from '../model';

export function GalleryView({ properties, rows, config, onOpenRow }: { properties: CollectionPropertyDefinition[]; rows: CollectionRow[]; config: CollectionViewConfig; onOpenRow: (row: CollectionRow) => void }) {
  const subtitle = properties.find((property) => config.visiblePropertyIds.includes(property.id) && property.type !== 'checkbox');
  return (
    <div data-testid="collection-gallery-view" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((row) => <button key={row.id} type="button" onClick={() => onOpenRow(row)} className="overflow-hidden rounded-lg border border-border bg-bg text-left shadow-sm transition-colors hover:border-border-strong hover:bg-bg-hover"><div className="flex h-28 items-center justify-center bg-bg-subtle text-fg-muted"><ImageIcon className="size-7" strokeWidth={1.5} /></div><div className="p-3"><div className="truncate text-sm font-medium">{row.title || 'Untitled'}</div>{subtitle ? <div className="mt-1 truncate text-xs text-fg-muted">{displayCollectionValue(row.properties[subtitle.id]) || 'Empty'}</div> : null}</div></button>)}
      {!rows.length ? <p className="col-span-full px-4 py-10 text-center text-sm text-fg-muted">No rows match this view.</p> : null}
    </div>
  );
}

