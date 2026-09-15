import type { CollectionPropertyDefinition, CollectionRow, CollectionViewConfig } from '../model';
import { displayCollectionValue } from '../model';
import { groupRows } from './view-utils';

export function BoardView({ properties, rows, config, onOpenRow }: { properties: CollectionPropertyDefinition[]; rows: CollectionRow[]; config: CollectionViewConfig; onOpenRow: (row: CollectionRow) => void }) {
  const groupProperty = config.groupBy ?? properties.find((property) => property.type === 'select' || property.type === 'status')?.id ?? null;
  const groups = groupRows(rows, groupProperty);
  return (
    <div data-testid="collection-board-view" className="flex min-h-64 gap-3 overflow-x-auto pb-2">
      {groups.map((group) => (
        <section key={group.key ?? 'ungrouped'} className="w-64 shrink-0 rounded-lg bg-bg-subtle p-2">
          <h3 className="flex items-center justify-between px-2 py-1 text-xs font-semibold text-fg-muted">{group.label ?? 'All rows'}<span className="font-normal">{group.rows.length}</span></h3>
          <div className="mt-2 flex flex-col gap-2">
            {group.rows.map((row) => <button key={row.id} type="button" onClick={() => onOpenRow(row)} className="rounded-md border border-border bg-bg p-3 text-left shadow-sm hover:border-border-strong hover:bg-bg-hover"><span className="block truncate text-sm font-medium">{row.title || 'Untitled'}</span>{groupProperty ? <span className="mt-1 block truncate text-xs text-fg-muted">{displayCollectionValue(row.properties[groupProperty]) || 'Empty'}</span> : null}</button>)}
          </div>
        </section>
      ))}
    </div>
  );
}

