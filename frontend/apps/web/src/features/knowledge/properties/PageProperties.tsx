import { useMemo, useState } from 'react';
import { ChevronRightIcon } from 'lucide-react';
import type { PageProperties as PagePropertiesMap, PagePropertyType } from '@nook/api-client';
import { Button, Skeleton, cn } from '@nook/ui';
import { usePatchProperties, useProperties, useSetProperties } from '../api/queries';
import { coerceValue, defaultValue } from '../lib/property-types';
import { readJson, writeJson } from '../lib/storage';
import { AddProperty } from './AddProperty';
import { AliasesRow } from './AliasesRow';
import { PropertyRow } from './PropertyRow';
import { TagsRow } from './TagsRow';

const COLLAPSED_KEY = 'nook.knowledge.properties.collapsed';

/**
 * Frontmatter-style property bar rendered by PageView under the title (contracts §9.3, §10).
 * Rows: one per property, then Tags (§9.2) and Aliases (§9.4). Collapsed state is per browser.
 */
export function PageProperties({ workspaceId, nodeId, readOnly }: { workspaceId: string; nodeId: string; readOnly?: boolean }) {
  const { data, isPending, isError } = useProperties(workspaceId, nodeId);
  const patch = usePatchProperties(workspaceId, nodeId);
  const replace = useSetProperties(workspaceId, nodeId);
  const [collapsed, setCollapsedState] = useState(() => readJson<boolean>(COLLAPSED_KEY, false));
  const setCollapsed = (v: boolean) => {
    setCollapsedState(v);
    writeJson(COLLAPSED_KEY, v);
  };
  const names = useMemo(() => Object.keys(data ?? {}), [data]);

  if (isError) return null;
  if (isPending)
    return (
      <div data-testid="page-properties" aria-busy className="mb-4 flex flex-col gap-1.5">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-6 w-72" />
      </div>
    );

  const props: PagePropertiesMap = data ?? {};
  const count = names.length;

  return (
    <section data-testid="page-properties" data-collapsed={collapsed || undefined} className="mb-4 -ml-1.5 text-sm">
      <Button
        type="button"
        variant="subtle"
        size="xs"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed(!collapsed)}
        className="mb-0.5 h-6 rounded-sm px-1.5 text-[11px] font-medium tracking-wide text-muted-foreground/70 uppercase hover:text-foreground"
      >
        <ChevronRightIcon className={cn('size-3.5 transition-transform', !collapsed && 'rotate-90')} />
        Properties
        {collapsed ? <span className="ml-1 font-normal normal-case">· {count} {count === 1 ? 'property' : 'properties'}, tags, aliases</span> : null}
      </Button>
      {!collapsed ? (
        <div className="flex flex-col gap-px">
          {names.map((name) => {
            const prop = props[name]!;
            return (
              <PropertyRow
                key={name}
                workspaceId={workspaceId}
                name={name}
                prop={prop}
                readOnly={readOnly}
                existingNames={names}
                onChange={(value) => patch.mutate({ [name]: { type: prop.type, value } })}
                onRename={(newName) => {
                  const next: PagePropertiesMap = {};
                  for (const [n, p] of Object.entries(props)) next[n === name ? newName : n] = p;
                  replace.mutate(next);
                }}
                onChangeType={(type: PagePropertyType) => patch.mutate({ [name]: { type, value: coerceValue(type, prop) } })}
                onDelete={() => patch.mutate({ [name]: null })}
              />
            );
          })}
          <TagsRow workspaceId={workspaceId} nodeId={nodeId} readOnly={readOnly} />
          <AliasesRow workspaceId={workspaceId} nodeId={nodeId} readOnly={readOnly} />
          {!readOnly ? (
            <AddProperty existingNames={names} onAdd={(name, type) => patch.mutate({ [name]: { type, value: defaultValue(type) } })} />
          ) : null}
        </div>
      ) : null}
      <div className="mt-2 h-px bg-border" />
    </section>
  );
}
