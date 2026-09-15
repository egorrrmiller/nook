import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { SignpostIcon } from 'lucide-react';
import { Input, cn } from '@nook/ui';
import { nodeTitle } from '../../../lib/utils';
import { parseAliasConflict, useAliases, useSetAliases, type AliasConflict } from '../api/queries';
import { Chip } from '../ui/Chip';
import { emptyClass, valueCellClass } from './editors/types';
import { nameCellClass } from './PropertyRow';

/** "Also known as" row (§9.4). 409 conflicts show the other page with a link to it. */
export function AliasesRow({ workspaceId, nodeId, readOnly }: { workspaceId: string; nodeId: string; readOnly?: boolean }) {
  const { data: aliases } = useAliases(workspaceId, nodeId);
  const set = useSetAliases(workspaceId, nodeId);
  const [draft, setDraft] = useState('');
  const [conflict, setConflict] = useState<AliasConflict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = aliases ?? [];

  const save = (next: string[]) => {
    setConflict(null);
    setError(null);
    set.mutate(next, {
      onError: (err) => {
        const c = parseAliasConflict(err);
        if (c) setConflict(c);
        else setError(err instanceof Error ? err.message : 'Could not save aliases');
      },
    });
  };
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (list.some((a) => a.toLowerCase() === v.toLowerCase())) {
      setDraft('');
      return;
    }
    save([...list, v]);
    setDraft('');
  };

  return (
    <div data-testid="property-row" data-property="Aliases" className="flex items-start gap-1">
      <div className={nameCellClass} title="Aliases — other names that resolve to this page">
        <SignpostIcon />
        <span className="truncate">Also known as</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className={cn(valueCellClass, 'flex-wrap gap-1', readOnly && 'hover:bg-transparent')}>
          {list.map((a) => (
            <Chip key={a} label={a} color="#787774" onRemove={readOnly ? undefined : () => save(list.filter((x) => x !== a))} />
          ))}
          {readOnly ? (
            !list.length ? <span className={emptyClass}>Empty</span> : null
          ) : (
            <Input
              value={draft}
              aria-label="Add alias"
              placeholder={list.length ? 'Add…' : 'Add an alias…'}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={add}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  add();
                } else if (e.key === 'Backspace' && !draft && list.length) save(list.slice(0, -1));
              }}
              className="h-5 min-w-20 flex-1 rounded-none border-0 bg-transparent px-0 text-sm shadow-none focus-visible:border-0 focus-visible:ring-0 placeholder:text-muted-foreground/70"
            />
          )}
        </div>
        {conflict ? (
          <p role="alert" data-testid="alias-conflict" className="px-1.5 pb-1 text-[11px] text-destructive">
            “{conflict.alias}” is already used
            {conflict.node ? (
              <>
                {' '}
                by{' '}
                <Link
                  to="/w/$workspaceId/p/$nodeId"
                  params={{ workspaceId, nodeId: conflict.node.id }}
                  className="font-medium underline underline-offset-2"
                >
                  {conflict.node.icon?.type === 'emoji' ? `${conflict.node.icon.value} ` : ''}
                  {nodeTitle(conflict.node.title)}
                </Link>
              </>
            ) : (
              ' by another page'
            )}
            .
          </p>
        ) : error ? (
          <p role="alert" className="px-1.5 pb-1 text-[11px] text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
