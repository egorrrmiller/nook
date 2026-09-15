import { FilterIcon, GroupIcon, PlusIcon, Settings2Icon, SortAscIcon, XIcon } from 'lucide-react';
import { Button, Checkbox, Input, Popover, PopoverContent, PopoverTrigger, Select, cn } from '@nook/ui';
import type { CollectionFilterGroup, CollectionFilterOperator, CollectionPropertyDefinition, CollectionSort, CollectionView, CollectionViewConfig } from './model';
import { cloneViewConfig } from './model';

const viewLabels = { table: 'Table', board: 'Board', list: 'List', gallery: 'Gallery', calendar: 'Calendar' } as const;
const operators: { value: CollectionFilterOperator; label: string }[] = [
  { value: 'contains', label: 'contains' },
  { value: 'equals', label: 'is' },
  { value: 'does_not_contain', label: 'does not contain' },
  { value: 'is_empty', label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' },
  { value: 'greater_than', label: '>' },
  { value: 'less_than', label: '<' },
];

export function CollectionViewToolbar({ views, activeViewId, properties, config, readOnly, onViewChange, onConfigChange }: { views: CollectionView[]; activeViewId: string; properties: CollectionPropertyDefinition[]; config: CollectionViewConfig; readOnly?: boolean; onViewChange: (id: string) => void; onConfigChange: (config: CollectionViewConfig) => void }) {
  const active = views.find((view) => view.id === activeViewId);
  const configured = config.visiblePropertyIds.length ? config.visiblePropertyIds : properties.filter((property) => !property.hidden).slice(0, 6).map((property) => property.id);
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="collection-view-toolbar">
      <Select value={activeViewId} onValueChange={onViewChange} aria-label="View" options={views.map((view) => ({ value: view.id, label: `${view.name} · ${viewLabels[view.kind]}` }))} className="w-44" />
      <FilterPopover properties={properties} group={config.filters} readOnly={readOnly} onChange={(filters) => onConfigChange({ ...cloneViewConfig(config), filters })} />
      <SortPopover properties={properties} sorts={config.sorts} readOnly={readOnly} onChange={(sorts) => onConfigChange({ ...cloneViewConfig(config), sorts })} />
      <GroupPopover properties={properties} value={config.groupBy ?? ''} readOnly={readOnly} onChange={(groupBy) => onConfigChange({ ...cloneViewConfig(config), groupBy: groupBy || null })} />
      <PropertiesPopover properties={properties} selected={configured} readOnly={readOnly} onChange={(visiblePropertyIds) => onConfigChange({ ...cloneViewConfig(config), visiblePropertyIds })} />
      {active ? <span className="ml-1 hidden text-xs text-fg-muted sm:inline">{active.name}</span> : null}
    </div>
  );
}

function FilterPopover({ properties, group, readOnly, onChange }: { properties: CollectionPropertyDefinition[]; group: CollectionFilterGroup; readOnly?: boolean; onChange: (group: CollectionFilterGroup) => void }) {
  const rules = group.children.filter((child): child is Extract<CollectionFilterGroup['children'][number], { kind: 'rule' }> => child.kind === 'rule');
  const firstProperty = properties[0]?.id ?? '';
  const add = () => onChange({ ...group, children: [...group.children, { kind: 'rule', propertyId: firstProperty, operator: 'contains', value: '' }] });
  return (
    <Popover>
      <PopoverTrigger aria-label="Filters" className={cn('inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-fg-muted hover:bg-bg-hover', rules.length && 'bg-bg-subtle text-fg')}><FilterIcon className="size-3.5" />Filter{rules.length ? <span className="rounded-full bg-bg-active px-1.5 text-[11px]">{rules.length}</span> : null}</PopoverTrigger>
      <PopoverContent className="w-[min(420px,calc(100vw-24px))] p-3" aria-label="Filter rows">
        <div className="mb-2 flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Filter rows</span><Select value={group.operator} onValueChange={(operator) => onChange({ ...group, operator: operator as 'and' | 'or' })} options={[{ value: 'and', label: 'All filters (AND)' }, { value: 'or', label: 'Any filter (OR)' }]} className="w-36" /></div>
        <div className="flex flex-col gap-2">{rules.map((rule, index) => <div key={`${rule.propertyId}-${index}`} className="flex items-center gap-1.5"><Select value={rule.propertyId} onValueChange={(propertyId) => onChange({ ...group, children: group.children.map((child) => child === rule ? { ...rule, propertyId } : child) })} options={properties.map((property) => ({ value: property.id, label: property.name }))} className="min-w-0 flex-1" /><Select value={rule.operator} onValueChange={(operator) => onChange({ ...group, children: group.children.map((child) => child === rule ? { ...rule, operator: operator as CollectionFilterOperator } : child) })} options={operators.map((operator) => ({ value: operator.value, label: operator.label }))} className="w-32" />{!['is_empty', 'is_not_empty'].includes(rule.operator) ? <Input aria-label={`Filter value ${index + 1}`} value={typeof rule.value === 'string' ? rule.value : ''} onChange={(event) => onChange({ ...group, children: group.children.map((child) => child === rule ? { ...rule, value: event.target.value } : child) })} className="w-28" /> : null}<Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove filter ${index + 1}`} onClick={() => onChange({ ...group, children: group.children.filter((child) => child !== rule) })}><XIcon className="size-3.5" /></Button></div>)}</div>
        {!readOnly ? <Button type="button" variant="subtle" size="sm" className="mt-2" onClick={add} disabled={!firstProperty}><PlusIcon className="size-3.5" /> Add filter</Button> : null}
      </PopoverContent>
    </Popover>
  );
}

function SortPopover({ properties, sorts, readOnly, onChange }: { properties: CollectionPropertyDefinition[]; sorts: CollectionSort[]; readOnly?: boolean; onChange: (sorts: CollectionSort[]) => void }) {
  const add = () => { const propertyId = properties[0]?.id; if (propertyId) onChange([...sorts, { propertyId, direction: 'ascending' }]); };
  return (
    <Popover>
      <PopoverTrigger aria-label="Sort" className={cn('inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-fg-muted hover:bg-bg-hover', sorts.length && 'bg-bg-subtle text-fg')}><SortAscIcon className="size-3.5" />Sort{sorts.length ? <span className="rounded-full bg-bg-active px-1.5 text-[11px]">{sorts.length}</span> : null}</PopoverTrigger>
      <PopoverContent className="w-72 p-3" aria-label="Sort rows"><span className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Sort rows</span><div className="mt-2 flex flex-col gap-2">{sorts.map((sort, index) => <div key={`${sort.propertyId}-${index}`} className="flex items-center gap-1.5"><Select aria-label={`Sort property ${index + 1}`} value={sort.propertyId} onValueChange={(propertyId) => onChange(sorts.map((current, i) => i === index ? { ...current, propertyId } : current))} options={properties.map((property) => ({ value: property.id, label: property.name }))} className="min-w-0 flex-1" /><Select aria-label={`Sort direction ${index + 1}`} value={sort.direction} onValueChange={(direction) => onChange(sorts.map((current, i) => i === index ? { ...current, direction: direction as CollectionSort['direction'] } : current))} options={[{ value: 'ascending', label: 'Ascending' }, { value: 'descending', label: 'Descending' }]} className="w-28" /><Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove sort ${index + 1}`} onClick={() => onChange(sorts.filter((_, i) => i !== index))}><XIcon className="size-3.5" /></Button></div>)}</div>{!readOnly ? <Button type="button" variant="subtle" size="sm" className="mt-2" onClick={add}><PlusIcon className="size-3.5" /> Add sort</Button> : null}</PopoverContent>
    </Popover>
  );
}

function GroupPopover({ properties, value, readOnly, onChange }: { properties: CollectionPropertyDefinition[]; value: string; readOnly?: boolean; onChange: (value: string) => void }) {
  return <label className="inline-flex items-center"><GroupIcon className="pointer-events-none relative left-6 size-3.5 text-fg-muted" /><Select aria-label="Group" value={value} onValueChange={onChange} disabled={readOnly} options={[{ value: '', label: 'No groups' }, ...properties.map((property) => ({ value: property.id, label: `Group by ${property.name}` }))]} className="w-36 pl-5" /></label>;
}

function PropertiesPopover({ properties, selected, readOnly, onChange }: { properties: CollectionPropertyDefinition[]; selected: string[]; readOnly?: boolean; onChange: (value: string[]) => void }) {
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]);
  return <Popover><PopoverTrigger aria-label="Properties" className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-fg-muted hover:bg-bg-hover"><Settings2Icon className="size-3.5" />Properties</PopoverTrigger><PopoverContent className="w-56 p-2" aria-label="Visible properties"><p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-fg-muted">Visible properties</p>{properties.map((property) => <label key={property.id} className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-bg-hover"><Checkbox checked={selected.includes(property.id)} disabled={readOnly} onChange={() => toggle(property.id)} />{property.name}</label>)}</PopoverContent></Popover>;
}
