import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckIcon, HashIcon, PlusIcon, TagIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger, Tooltip, cn } from '@nook/ui';
import { useNodeTags, useSetNodeTags, useTags } from '../api/queries';
import { colorForLabel } from '../lib/tag-colors';
import { Chip } from '../ui/Chip';
import { OptionPickerInput } from '../ui/OptionPickerInput';
import { emptyClass, valueCellClass } from './editors/types';
import { nameCellClass } from './PropertyRow';

/** "Tags" row of the properties bar (§9.2): manual tags editable, inline `#tags` shown read-only. */
export function TagsRow({ workspaceId, nodeId, readOnly }: { workspaceId: string; nodeId: string; readOnly?: boolean }) {
  const { data: nodeTags } = useNodeTags(workspaceId, nodeId);
  const [open, setOpen] = useState(false);
  const { data: allTags } = useTags(workspaceId, open);
  const setTags = useSetNodeTags(workspaceId, nodeId);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const manual = useMemo(() => (nodeTags ?? []).filter((t) => t.source === 'manual'), [nodeTags]);
  const inline = useMemo(() => (nodeTags ?? []).filter((t) => t.source === 'inline'), [nodeTags]);
  const q = query.trim();
  const candidates = (allTags ?? []).filter((t) => t.name.toLowerCase().includes(q.toLowerCase()));
  const canCreate = q.length > 0 && !(allTags ?? []).some((t) => t.name.toLowerCase() === q.toLowerCase());
  const rows: ({ kind: 'tag'; id: string; name: string; color?: string | null; count?: number } | { kind: 'create' })[] = [
    ...candidates.map((t) => ({ kind: 'tag' as const, id: t.id, name: t.name, color: t.color, count: t.count })),
    ...(canCreate ? [{ kind: 'create' as const }] : []),
  ];
  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const commit = (ids: string[], names: string[] = []) => setTags.mutate({ tagIds: ids, names });
  const toggle = (id: string) => {
    const ids = manual.map((t) => t.id);
    commit(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
    setQuery('');
  };
  const create = (name: string) => {
    commit(
      manual.map((t) => t.id),
      [name],
    );
    setQuery('');
  };

  const chips = (
    <span className="flex flex-wrap items-center gap-1">
      {manual.map((t) => (
        <Chip key={t.id} label={t.name} color={t.color} onRemove={readOnly ? undefined : () => toggle(t.id)} />
      ))}
      {inline.map((t) => (
        <Tooltip key={t.id} content={`#${t.name} — from the page text`}>
          <span>
            <Chip label={`#${t.name}`} color={t.color} muted />
          </span>
        </Tooltip>
      ))}
      {!manual.length && !inline.length ? <span className={emptyClass}>Empty</span> : null}
    </span>
  );

  return (
    <div data-testid="property-row" data-property="Tags" className="flex items-start gap-1">
      <div className={nameCellClass} title="Tags">
        <TagIcon />
        <span className="truncate">Tags</span>
      </div>
      <div className="min-w-0 flex-1">
        {readOnly ? (
          <div className={cn(valueCellClass, 'hover:bg-transparent')}>{chips}</div>
        ) : (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger aria-label="Tags" data-testid="tags-trigger" className={cn(valueCellClass, 'cursor-pointer text-left', open && 'bg-accent')}>
              {chips}
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" aria-label="Edit tags" initialFocus={inputRef}>
              <OptionPickerInput
                inputRef={inputRef}
                value={query}
                onChange={setQuery}
                placeholder={manual.length ? '' : 'Search or create a tag…'}
                ariaLabel="Search tags"
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setActive((a) => Math.min(rows.length - 1, a + 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setActive((a) => Math.max(0, a - 1));
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    const row = rows[active];
                    if (!row) return;
                    if (row.kind === 'create') create(q);
                    else toggle(row.id);
                  } else if (e.key === 'Backspace' && !query && manual.length) {
                    toggle(manual[manual.length - 1]!.id);
                  } else if (e.key === 'Escape') setOpen(false);
                }}
              >
                {manual.map((t) => (
                  <Chip key={t.id} label={t.name} color={t.color} onRemove={() => toggle(t.id)} />
                ))}
              </OptionPickerInput>
              <p className="px-2 pt-1.5 pb-0.5 text-[11px] text-muted-foreground">Select tags or create one</p>
              <ul role="listbox" aria-label="Tags" className="max-h-60 overflow-y-auto p-1">
                {rows.map((row, i) =>
                  row.kind === 'create' ? (
                    <li
                      key="__create"
                      role="option"
                      aria-selected={i === active}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => create(q)}
                      className={cn('flex cursor-pointer items-center gap-1.5 rounded-sm px-2 py-1 text-sm', i === active && 'bg-accent')}
                    >
                      <PlusIcon className="size-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Create</span>
                      <Chip label={q} color={colorForLabel(q)} />
                    </li>
                  ) : (
                    <li
                      key={row.id}
                      role="option"
                      aria-selected={i === active}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => toggle(row.id)}
                      className={cn('flex cursor-pointer items-center gap-1.5 rounded-sm px-2 py-1 text-sm', i === active && 'bg-accent')}
                    >
                      <Chip label={row.name} color={row.color} />
                      {manual.some((t) => t.id === row.id) ? <CheckIcon className="size-3.5 text-muted-foreground" /> : null}
                      <span className="ml-auto text-[11px] text-muted-foreground">{row.count ?? 0}</span>
                    </li>
                  ),
                )}
                {rows.length === 0 ? (
                  <li className="px-2 py-2 text-xs text-muted-foreground">
                    {allTags ? 'No tags yet — type to create one.' : 'Loading…'}
                  </li>
                ) : null}
              </ul>
              {inline.length ? (
                <p className="flex items-center gap-1 border-t border-border px-2 py-1.5 text-[11px] text-muted-foreground">
                  <HashIcon className="size-3" /> Inline tags come from the text and cannot be removed here.
                </p>
              ) : null}
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
}
