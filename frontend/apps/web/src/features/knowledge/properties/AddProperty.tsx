import { useEffect, useRef, useState } from 'react';
import { PlusIcon } from 'lucide-react';
import type { PagePropertyType } from '@nook/api-client';
import { Input, Popover, PopoverContent, PopoverTrigger, cn } from '@nook/ui';
import { PROPERTY_TYPES } from '../lib/property-types';

export function AddProperty({ existingNames, onAdd }: { existingNames: string[]; onAdd: (name: string, type: PagePropertyType) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) {
      setName('');
      setActive(0);
    }
  }, [open]);
  const trimmed = name.trim();
  const duplicate = existingNames.some((n) => n.toLowerCase() === trimmed.toLowerCase());
  const filtered = PROPERTY_TYPES.filter((t) => !trimmed || t.label.toLowerCase().includes(trimmed.toLowerCase()) || true);

  const submit = (type: PagePropertyType) => {
    const finalName = trimmed || PROPERTY_TYPES.find((t) => t.type === type)?.label || 'Property';
    if (existingNames.some((n) => n.toLowerCase() === finalName.toLowerCase())) return;
    onAdd(finalName, type);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        data-testid="add-property"
        className={cn(
          'flex h-8 items-center gap-1.5 rounded-sm px-1.5 text-sm text-muted-foreground/80 transition-colors hover:bg-accent hover:text-foreground',
          open && 'bg-accent text-foreground',
        )}
      >
        <PlusIcon className="size-4" /> Add a property
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" aria-label="New property" initialFocus={inputRef}>
        <div className="border-b border-border p-2">
          <Input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Property name"
            aria-label="Property name"
            aria-invalid={duplicate || undefined}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(filtered.length - 1, a + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                const t = filtered[active];
                if (t && !duplicate) submit(t.type);
              } else if (e.key === 'Escape') setOpen(false);
            }}
            className="h-7 rounded-sm px-2 text-sm"
          />
          {duplicate ? <p className="mt-1 text-[11px] text-destructive">A property with this name already exists.</p> : null}
        </div>
        <p className="px-2 pt-1.5 pb-0.5 text-[11px] text-muted-foreground">Type</p>
        <ul role="listbox" aria-label="Property type" className="p-1">
          {filtered.map((t, i) => {
            const Icon = t.icon;
            return (
              <li
                key={t.type}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => !duplicate && submit(t.type)}
                className={cn('flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-sm', i === active && 'bg-accent')}
              >
                <Icon className="size-4 text-muted-foreground" />
                <span>{t.label}</span>
                <span className="ml-auto text-[11px] text-muted-foreground">{t.hint}</span>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
