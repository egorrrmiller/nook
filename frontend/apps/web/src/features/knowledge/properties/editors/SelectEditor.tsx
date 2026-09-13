import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckIcon, MoreHorizontalIcon, PlusIcon } from 'lucide-react';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, Popover, PopoverContent, PopoverTrigger, cn } from '@nook/ui';
import { forgetSelectOption, getSelectOptions, rememberSelectOption, type SelectOption } from '../../lib/select-options';
import { TAG_PALETTE, colorForLabel } from '../../lib/tag-colors';
import { Chip } from '../../ui/Chip';
import { emptyClass, valueCellClass, type EditorProps } from './types';

/** select · multi_select — Notion-style option picker with create-on-type and colours. */
export function SelectEditor({ workspaceId, name, prop, onChange, readOnly }: EditorProps) {
  const multi = prop.type === 'multi_select';
  const selected = useMemo<string[]>(
    () => (Array.isArray(prop.value) ? prop.value : typeof prop.value === 'string' && prop.value ? [prop.value] : []),
    [prop.value],
  );
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [tick, setTick] = useState(0); // bump after registry writes
  const inputRef = useRef<HTMLInputElement>(null);

  const options = useMemo(() => getSelectOptions(workspaceId, name, selected), [workspaceId, name, selected, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const colorOf = (v: string) => options.find((o) => o.value === v)?.color ?? colorForLabel(v);
  const q = query.trim();
  const filtered = options.filter((o) => o.value.toLowerCase().includes(q.toLowerCase()));
  const canCreate = q.length > 0 && !options.some((o) => o.value.toLowerCase() === q.toLowerCase());
  const rows: ({ kind: 'option'; option: SelectOption } | { kind: 'create' })[] = [
    ...filtered.map((option) => ({ kind: 'option' as const, option })),
    ...(canCreate ? [{ kind: 'create' as const }] : []),
  ];

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const commit = (values: string[]) => onChange(multi ? values : values[0] ?? null);
  const toggle = (value: string) => {
    if (multi) commit(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
    else {
      commit([value]);
      setOpen(false);
    }
    setQuery('');
  };
  const create = (value: string) => {
    const option = { value, color: colorForLabel(value) };
    rememberSelectOption(workspaceId, name, option);
    setTick((t) => t + 1);
    toggle(value);
  };
  const recolor = (option: SelectOption, color: string) => {
    rememberSelectOption(workspaceId, name, { ...option, color });
    setTick((t) => t + 1);
  };
  const remove = (option: SelectOption) => {
    forgetSelectOption(workspaceId, name, option.value);
    if (selected.includes(option.value)) commit(selected.filter((v) => v !== option.value));
    setTick((t) => t + 1);
  };

  const chips = selected.length ? (
    <span className="flex flex-wrap items-center gap-1">
      {selected.map((v) => (
        <Chip key={v} label={v} color={colorOf(v)} onRemove={readOnly ? undefined : () => commit(selected.filter((x) => x !== v))} />
      ))}
    </span>
  ) : (
    <span className={emptyClass}>Empty</span>
  );

  if (readOnly) return <div className={cn(valueCellClass, 'hover:bg-transparent')}>{chips}</div>;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger aria-label={name} data-testid="select-trigger" className={cn(valueCellClass, 'cursor-pointer text-left', open && 'bg-accent')}>
        {chips}
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" aria-label={`${name} options`} initialFocus={inputRef}>
        <div className="flex flex-wrap items-center gap-1 border-b border-border bg-muted px-2 py-1.5">
          {selected.map((v) => (
            <Chip key={v} label={v} color={colorOf(v)} onRemove={() => commit(selected.filter((x) => x !== v))} />
          ))}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={selected.length ? '' : 'Search or create an option…'}
            aria-label={`Search ${name} options`}
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
                else toggle(row.option.value);
              } else if (e.key === 'Backspace' && !query && multi && selected.length) {
                commit(selected.slice(0, -1));
              } else if (e.key === 'Escape') setOpen(false);
            }}
            className="h-6 min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <p className="px-2 pt-1.5 pb-0.5 text-[11px] text-muted-foreground">{multi ? 'Select options or create one' : 'Select an option or create one'}</p>
        <ul role="listbox" aria-label={`${name} options`} className="max-h-60 overflow-y-auto p-1">
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
                key={row.option.value}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => toggle(row.option.value)}
                className={cn('group flex cursor-pointer items-center gap-1.5 rounded-sm px-2 py-1 text-sm', i === active && 'bg-accent')}
              >
                <Chip label={row.option.value} color={row.option.color} />
                {selected.includes(row.option.value) ? <CheckIcon className="size-3.5 text-muted-foreground" /> : null}
                <span className="ml-auto" />
                <Menu>
                  <MenuTrigger
                    aria-label={`Options for ${row.option.value}`}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded-sm p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-accent-strong data-popup-open:opacity-100"
                  >
                    <MoreHorizontalIcon className="size-3.5" />
                  </MenuTrigger>
                  <MenuContent align="end" onClick={(e) => e.stopPropagation()}>
                    <MenuLabel>Colour</MenuLabel>
                    {TAG_PALETTE.map((c) => (
                      <MenuItem key={c.value} onClick={() => recolor(row.option, c.value)}>
                        <span className="size-3.5 rounded-sm" style={{ backgroundColor: c.value }} />
                        {c.name}
                        {row.option.color === c.value ? <CheckIcon className="ml-auto size-3.5" /> : null}
                      </MenuItem>
                    ))}
                    <MenuSeparator />
                    <MenuItem variant="destructive" onClick={() => remove(row.option)}>
                      Delete option
                    </MenuItem>
                  </MenuContent>
                </Menu>
              </li>
            ),
          )}
          {rows.length === 0 ? <li className="px-2 py-2 text-xs text-muted-foreground">No options yet — type to create one.</li> : null}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
