import type { ReactNode } from 'react';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import type { NodeKind, Tag } from '@nook/api-client';
import { Menu, MenuCheckboxItem, MenuContent, MenuItem, MenuTrigger, Popover, PopoverContent, PopoverTrigger, cn } from '@nook/ui';
import { Chip } from '../ui/Chip';
import { datePreset, type DateRangeFilter } from './build-request';

export const chipClass =
  'inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-border px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-popup-open:bg-accent [&_svg]:size-3';
export const chipActive = 'border-primary/40 bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-foreground';

export function ToggleChip({ active, onClick, children, testId, title }: { active: boolean; onClick: () => void; children: ReactNode; testId?: string; title?: string }) {
  return (
    <button type="button" aria-pressed={active} title={title} data-testid={testId} onClick={onClick} className={cn(chipClass, active && chipActive)}>
      {children}
    </button>
  );
}

const KINDS: { kind: NodeKind; label: string }[] = [
  { kind: 'page', label: 'Pages' },
  { kind: 'database', label: 'Databases' },
  { kind: 'collection_row', label: 'Database rows' },
  { kind: 'folder', label: 'Folders' },
  { kind: 'file', label: 'Files' },
];

export function KindsFilter({ value, onChange }: { value: NodeKind[]; onChange: (v: NodeKind[]) => void }) {
  const label = value.length ? KINDS.filter((k) => value.includes(k.kind)).map((k) => k.label).join(', ') : 'Any type';
  return (
    <Menu>
      <MenuTrigger data-testid="search-filter-kinds" className={cn(chipClass, value.length && chipActive)}>
        {label} <ChevronDownIcon />
      </MenuTrigger>
      <MenuContent>
        {KINDS.map((k) => (
          <MenuCheckboxItem key={k.kind} checked={value.includes(k.kind)} closeOnClick={false} onCheckedChange={(c) => onChange(c ? [...value, k.kind] : value.filter((x) => x !== k.kind))}>
            {k.label}
          </MenuCheckboxItem>
        ))}
        {value.length ? (
          <MenuItem className="mt-1 border-t border-border text-muted-foreground" onClick={() => onChange([])}>
            Clear
          </MenuItem>
        ) : null}
      </MenuContent>
    </Menu>
  );
}

export function TagsFilter({ tags, value, onChange }: { tags: Tag[]; value: string[]; onChange: (v: string[]) => void }) {
  const chosen = tags.filter((t) => value.includes(t.id));
  return (
    <Popover>
      <PopoverTrigger data-testid="search-filter-tags" className={cn(chipClass, value.length && chipActive)}>
        {chosen.length ? (
          <span className="flex items-center gap-1">
            {chosen.slice(0, 2).map((t) => (
              <Chip key={t.id} label={t.name} color={t.color} size="sm" />
            ))}
            {chosen.length > 2 ? <span>+{chosen.length - 2}</span> : null}
          </span>
        ) : (
          'Any tag'
        )}
        <ChevronDownIcon />
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1" aria-label="Filter by tag">
        {tags.length === 0 ? <p className="px-2 py-1.5 text-xs text-muted-foreground">No tags in this workspace.</p> : null}
        <ul className="max-h-60 overflow-y-auto">
          {tags.map((t) => {
            const on = value.includes(t.id);
            return (
              <li key={t.id}>
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={on}
                  onClick={() => onChange(on ? value.filter((x) => x !== t.id) : [...value, t.id])}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-sm hover:bg-accent"
                >
                  <span className={cn('flex size-3.5 items-center justify-center rounded-sm border border-border-strong', on && 'border-primary bg-primary text-primary-foreground')}>
                    {on ? <CheckIcon className="size-3" /> : null}
                  </span>
                  <Chip label={t.name} color={t.color} />
                  <span className="ml-auto text-[11px] text-muted-foreground">{t.count ?? 0}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {value.length ? (
          <button type="button" onClick={() => onChange([])} className="mt-1 w-full rounded-sm border-t border-border px-2 py-1 text-left text-xs text-muted-foreground hover:bg-accent">
            Clear
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function fmt(d?: string) {
  if (!d) return '…';
  const date = new Date(`${d}T00:00:00`);
  return Number.isNaN(date.getTime()) ? d : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

export function DateFilter({ label, value, onChange, testId }: { label: string; value: DateRangeFilter; onChange: (v: DateRangeFilter) => void; testId?: string }) {
  const active = !!(value.from || value.to);
  return (
    <Popover>
      <PopoverTrigger data-testid={testId} className={cn(chipClass, active && chipActive)}>
        {label}
        {active ? `: ${fmt(value.from)} – ${fmt(value.to)}` : ''} <ChevronDownIcon />
      </PopoverTrigger>
      <PopoverContent className="w-60 p-2" aria-label={`${label} date range`}>
        <div className="mb-2 grid grid-cols-2 gap-1">
          {(
            [
              ['today', 'Today'],
              ['week', 'Last 7 days'],
              ['month', 'Last 30 days'],
              ['year', 'Last year'],
            ] as const
          ).map(([p, l]) => (
            <button key={p} type="button" onClick={() => onChange(datePreset(p))} className="rounded-sm border border-border px-2 py-1 text-xs hover:bg-accent">
              {l}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <input
            type="date"
            aria-label={`${label} from`}
            value={value.from ?? ''}
            onChange={(e) => onChange({ ...value, from: e.target.value || undefined })}
            className="h-7 min-w-0 flex-1 rounded-sm border border-input bg-background px-1.5 text-xs outline-none focus-visible:border-primary"
          />
          <span className="text-xs text-muted-foreground">→</span>
          <input
            type="date"
            aria-label={`${label} to`}
            value={value.to ?? ''}
            onChange={(e) => onChange({ ...value, to: e.target.value || undefined })}
            className="h-7 min-w-0 flex-1 rounded-sm border border-input bg-background px-1.5 text-xs outline-none focus-visible:border-primary"
          />
        </div>
        {active ? (
          <button type="button" onClick={() => onChange({})} className="mt-2 w-full rounded-sm px-2 py-1 text-left text-xs text-muted-foreground hover:bg-accent">
            Clear
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
