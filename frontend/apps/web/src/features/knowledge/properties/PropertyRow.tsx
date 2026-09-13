import { useState } from 'react';
import { CheckIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import type { PageProperty, PagePropertyType, PagePropertyValue } from '@nook/api-client';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuSub, MenuSubContent, MenuSubTrigger, MenuTrigger, cn } from '@nook/ui';
import { PROPERTY_TYPES, propertyMeta } from '../lib/property-types';
import { CheckboxEditor } from './editors/CheckboxEditor';
import { DateEditor } from './editors/DateEditor';
import { SelectEditor } from './editors/SelectEditor';
import { TextEditor } from './editors/TextEditor';

export const nameCellClass =
  'flex h-8 w-40 shrink-0 items-center gap-1.5 rounded-sm px-1.5 text-left text-sm text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0';

export interface PropertyRowProps {
  workspaceId: string;
  name: string;
  prop: PageProperty;
  readOnly?: boolean;
  existingNames: string[];
  onChange: (value: PagePropertyValue) => void;
  onRename: (newName: string) => void;
  onChangeType: (type: PagePropertyType) => void;
  onDelete: () => void;
}

export function PropertyRow({ workspaceId, name, prop, readOnly, existingNames, onChange, onRename, onChangeType, onDelete }: PropertyRowProps) {
  const meta = propertyMeta(prop.type);
  const Icon = meta.icon;
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(name);

  const commitRename = () => {
    const next = draft.trim();
    setRenaming(false);
    if (!next || next === name) return;
    if (existingNames.some((n) => n !== name && n.toLowerCase() === next.toLowerCase())) return;
    onRename(next);
  };

  const editor =
    prop.type === 'checkbox' ? (
      <CheckboxEditor workspaceId={workspaceId} name={name} prop={prop} onChange={onChange} readOnly={readOnly} />
    ) : prop.type === 'date' ? (
      <DateEditor workspaceId={workspaceId} name={name} prop={prop} onChange={onChange} readOnly={readOnly} />
    ) : prop.type === 'select' || prop.type === 'multi_select' ? (
      <SelectEditor workspaceId={workspaceId} name={name} prop={prop} onChange={onChange} readOnly={readOnly} />
    ) : (
      <TextEditor workspaceId={workspaceId} name={name} prop={prop} onChange={onChange} readOnly={readOnly} />
    );

  return (
    <div data-testid="property-row" data-property={name} className="group/row flex items-start gap-1">
      {readOnly ? (
        <div className={nameCellClass} title={meta.label}>
          <Icon />
          <span className="truncate">{name}</span>
        </div>
      ) : renaming ? (
        <div className={cn(nameCellClass, 'bg-accent')}>
          <Icon />
          <input
            autoFocus
            aria-label="Property name"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') {
                setDraft(name);
                setRenaming(false);
              }
            }}
            className="w-full min-w-0 bg-transparent text-foreground outline-none"
          />
        </div>
      ) : (
        <Menu>
          <MenuTrigger className={cn(nameCellClass, 'hover:bg-accent data-popup-open:bg-accent')} aria-label={`${name} (${meta.label}) — property menu`} title={meta.label}>
            <Icon />
            <span className="truncate">{name}</span>
          </MenuTrigger>
          <MenuContent className="min-w-52">
            <MenuItem
              onClick={() => {
                setDraft(name);
                setRenaming(true);
              }}
            >
              <PencilIcon /> Rename
            </MenuItem>
            <MenuSub>
              <MenuSubTrigger>
                <Icon /> Type: {meta.label}
              </MenuSubTrigger>
              <MenuSubContent>
                <MenuLabel>Change type</MenuLabel>
                {PROPERTY_TYPES.map((t) => {
                  const TIcon = t.icon;
                  return (
                    <MenuItem key={t.type} onClick={() => t.type !== prop.type && onChangeType(t.type)}>
                      <TIcon /> {t.label}
                      {t.type === prop.type ? <CheckIcon className="ml-auto" /> : null}
                    </MenuItem>
                  );
                })}
              </MenuSubContent>
            </MenuSub>
            <MenuSeparator />
            <MenuItem variant="destructive" onClick={onDelete}>
              <Trash2Icon /> Delete property
            </MenuItem>
          </MenuContent>
        </Menu>
      )}
      <div className="min-w-0 flex-1">{editor}</div>
    </div>
  );
}
