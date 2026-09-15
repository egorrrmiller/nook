import type { CollectionPropertyDefinition, CollectionRow, CollectionViewConfig, JsonValue } from '../model';
import { CollectionPropertyEditor } from './CollectionPropertyEditor';
import { groupRows } from './view-utils';

export interface CollectionViewProps {
  properties: CollectionPropertyDefinition[];
  rows: CollectionRow[];
  config: CollectionViewConfig;
  readOnly?: boolean;
  onChange: (row: CollectionRow, propertyId: string, value: JsonValue) => void;
  onOpenRow: (row: CollectionRow) => void;
}

function visibleProperties(properties: CollectionPropertyDefinition[], config: CollectionViewConfig) {
  const available = properties.filter((property) => !property.hidden);
  const configured = config.visiblePropertyIds.map((id) => properties.find((property) => property.id === id)).filter(Boolean) as CollectionPropertyDefinition[];
  return configured.length ? configured : available.slice(0, 6);
}

export function TableView({ properties, rows, config, readOnly, onChange, onOpenRow }: CollectionViewProps) {
  const columns = visibleProperties(properties, config);
  const groups = groupRows(rows, config.groupBy);
  return (
    <div className="w-full overflow-x-auto rounded-lg border border-border bg-bg" data-testid="collection-table-view">
      <table className="w-full min-w-[720px] border-collapse text-left">
        <thead className="bg-bg-subtle text-xs text-fg-muted">
          <tr className="border-b border-border">
            <th className="w-[min(280px,30vw)] px-3 py-2 font-medium">Name</th>
            {columns.map((property) => <th key={property.id} className="min-w-36 border-l border-border px-3 py-2 font-medium">{property.name}</th>)}
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <GroupRows key={group.key ?? 'ungrouped'} groupLabel={group.label} rows={group.rows} columns={columns} readOnly={readOnly} onChange={onChange} onOpenRow={onOpenRow} />
          ))}
        </tbody>
      </table>
      {!rows.length ? <div className="px-4 py-12 text-center text-sm text-fg-muted">No rows match this view.</div> : null}
    </div>
  );
}

function GroupRows({ groupLabel, rows, columns, readOnly, onChange, onOpenRow }: { groupLabel: string | null; rows: CollectionRow[]; columns: CollectionPropertyDefinition[]; readOnly?: boolean; onChange: CollectionViewProps['onChange']; onOpenRow: CollectionViewProps['onOpenRow'] }) {
  return (
    <>
      {groupLabel ? <tr data-testid="collection-table-group" className="border-b border-border bg-bg-subtle"><th colSpan={columns.length + 1} className="px-3 py-2 text-xs font-semibold text-fg-muted">{groupLabel} <span className="font-normal">{rows.length}</span></th></tr> : null}
      {rows.map((row) => (
        <tr key={row.id} data-testid="collection-table-row" className="group border-b border-border last:border-0 hover:bg-bg-hover" onClick={() => onOpenRow(row)}>
          <td className="px-3 py-1.5">
            <button type="button" className="flex min-w-0 max-w-full items-center gap-2 text-left text-sm font-medium text-fg hover:underline" onClick={() => onOpenRow(row)}>
              <span className="size-5 shrink-0 rounded-sm bg-bg-subtle" aria-hidden>{row.icon?.type === 'emoji' ? row.icon.value : '▧'}</span>
              <span className="truncate">{row.title || 'Untitled'}</span>
            </button>
          </td>
          {columns.map((property) => (
            <td key={property.id} className="border-l border-border px-1 py-0.5" onClick={(event) => event.stopPropagation()}>
              <CollectionPropertyEditor property={property} value={row.properties[property.id]} readOnly={readOnly} onCommit={(value) => onChange(row, property.id, value)} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export { visibleProperties };
