import { useNavigate } from '@tanstack/react-router';
import { RotateCcwIcon, SearchIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import type { TrashItem } from '@nook/api-client';
import { Button, ConfirmDialog, Input, Skeleton, cn } from '@nook/ui';
import { useDebouncedValue } from '../../lib/hooks';
import { useEmptyTrash, usePurgeTrash, useRestoreTrash, useTrash } from '../../lib/queries';
import { formatDate, nodeTitle } from '../../lib/utils';
import { toast } from '../../stores/toast';
import { NodeIcon } from '../tree/NodeIcon';
import { BreadcrumbText } from '../tree/BreadcrumbText';

/** `/w/$workspaceId/trash` — restore / delete forever / empty trash (contracts §7.2). */
export function TrashView({ workspaceId }: { workspaceId: string }) {
  const [query, setQuery] = useState('');
  const q = useDebouncedValue(query, 200);
  const { data, isPending } = useTrash(workspaceId, q);
  const restore = useRestoreTrash(workspaceId);
  const purge = usePurgeTrash(workspaceId);
  const empty = useEmptyTrash(workspaceId);
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState<{ kind: 'purge'; item: TrashItem } | { kind: 'empty' } | null>(null);

  const items = data ?? [];

  return (
    <div className="mx-auto w-full max-w-[var(--content-max)] px-6 py-10" data-testid="trash-view">
      <header className="mb-6 flex items-center gap-3">
        <Trash2Icon className="size-6 text-fg-muted" />
        <h1 className="text-2xl font-bold">Trash</h1>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          disabled={!items.length}
          onClick={() => setConfirm({ kind: 'empty' })}
          data-testid="empty-trash"
        >
          Empty trash
        </Button>
      </header>

      <div className="relative mb-4">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-fg-muted" />
        <Input
          className="pl-8"
          placeholder="Search pages in trash…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          data-testid="trash-search"
        />
      </div>

      {isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : items.length ? (
        <ul className="flex flex-col divide-y divide-border rounded-[var(--radius)] border border-border">
          {items.map((item) => (
            <li
              key={item.node.id}
              data-testid="trash-item"
              className="group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-bg-hover"
            >
              <NodeIcon icon={item.node.icon} kind={item.node.kind} size={20} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{nodeTitle(item.node.title)}</span>
                <span className="flex items-center gap-2">
                  <BreadcrumbText crumbs={item.breadcrumb} />
                  {item.breadcrumb.length ? <span className="text-xs text-fg-disabled">·</span> : null}
                  <span className="shrink-0 text-xs text-fg-muted">Deleted {formatDate(item.deletedAt)}</span>
                </span>
              </span>
              <span className={cn('flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100')}>
                <Button
                  variant="secondary"
                  size="sm"
                  data-testid="trash-restore"
                  onClick={() =>
                    restore.mutate(
                      { id: item.node.id },
                      {
                        onSuccess: (node) => {
                          toast(`Restored “${nodeTitle(node.title)}”`);
                          void navigate({ to: '/w/$workspaceId/p/$nodeId', params: { workspaceId, nodeId: node.id } });
                        },
                      },
                    )
                  }
                >
                  <RotateCcwIcon /> Restore
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-danger"
                  data-testid="trash-purge"
                  onClick={() => setConfirm({ kind: 'purge', item })}
                >
                  Delete forever
                </Button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-[var(--radius)] border border-dashed border-border px-4 py-10 text-center text-sm text-fg-muted">
          {q ? 'No pages in trash match your search.' : 'Trash is empty. Deleted pages appear here.'}
        </p>
      )}

      <ConfirmDialog
        open={confirm?.kind === 'purge'}
        onOpenChange={(o) => !o && setConfirm(null)}
        variant="destructive"
        title="Delete forever?"
        description={
          confirm?.kind === 'purge'
            ? `“${nodeTitle(confirm.item.node.title)}” and everything inside it will be permanently deleted. This cannot be undone.`
            : undefined
        }
        confirmLabel="Delete forever"
        onConfirm={async () => {
          if (confirm?.kind !== 'purge') return;
          await purge.mutateAsync(confirm.item.node.id);
          toast('Deleted permanently');
        }}
      />
      <ConfirmDialog
        open={confirm?.kind === 'empty'}
        onOpenChange={(o) => !o && setConfirm(null)}
        variant="destructive"
        title="Empty trash?"
        description="Every page in the trash will be permanently deleted. This cannot be undone."
        confirmLabel="Empty trash"
        onConfirm={async () => {
          await empty.mutateAsync();
          toast('Trash emptied');
        }}
      />
    </div>
  );
}
