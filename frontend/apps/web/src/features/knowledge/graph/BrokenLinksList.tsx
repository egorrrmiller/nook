import { Link } from '@tanstack/react-router';
import { CheckCircle2Icon, UnlinkIcon } from 'lucide-react';
import { Skeleton } from '@nook/ui';
import { nodeTitle } from '../../../lib/utils';
import { useBrokenLinks } from '../api/queries';
import { EmptyState } from '../ui/EmptyState';
import { NodeIcon } from '../ui/NodeIcon';

/** Side list of broken links (§9.1 `GET /api/links/broken`), each linking to the source block. */
export function BrokenLinksList({ workspaceId }: { workspaceId: string }) {
  const { data, isPending, isError } = useBrokenLinks(workspaceId);
  return (
    <section data-testid="broken-links" className="flex min-h-0 flex-col">
      <header className="flex items-center gap-1 px-3 py-2">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Broken links</h2>
        {data?.length ? <span className="ml-auto rounded-sm bg-[color-mix(in_srgb,var(--destructive)_12%,transparent)] px-1.5 text-[11px] font-medium text-destructive">{data.length}</span> : null}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2">
        {isPending ? (
          <div className="flex flex-col gap-2 px-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : isError ? (
          <p className="px-3 text-xs text-destructive">Could not load broken links.</p>
        ) : !data?.length ? (
          <EmptyState icon={<CheckCircle2Icon />} title="No broken links" hint="Every link in this workspace resolves." className="py-6" />
        ) : (
          <ul className="flex flex-col gap-0.5">
            {data.map((b, i) => (
              <li key={`${b.sourceNode.id}-${b.blockId}-${i}`}>
                <Link
                  to="/w/$workspaceId/p/$nodeId"
                  params={{ workspaceId, nodeId: b.sourceNode.id }}
                  hash={b.blockId ? `b-${b.blockId}` : undefined}
                  data-testid="broken-link-item"
                  className="flex flex-col gap-0.5 rounded-md px-2 py-1.5 hover:bg-accent"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <NodeIcon icon={b.sourceNode.icon} kind={b.sourceNode.kind} />
                    <span className="truncate text-sm">{nodeTitle(b.sourceNode.title)}</span>
                  </span>
                  <span className="flex min-w-0 items-center gap-1 pl-5 text-[11px] text-muted-foreground">
                    <UnlinkIcon className="size-3 shrink-0 text-destructive" />
                    <span className="truncate">{b.href ?? b.targetNodeId ?? 'unknown target'}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
