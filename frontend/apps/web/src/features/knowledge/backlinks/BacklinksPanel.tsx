import { useCallback, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangleIcon, ArrowUpRightIcon, ChevronRightIcon, ExternalLinkIcon, Link2Icon, RefreshCwIcon, UnlinkIcon } from 'lucide-react';
import type { Backlink, OutgoingLink } from '@nook/api-client';
import { IconButton, Skeleton, cn } from '@nook/ui';
import { useNode } from '../../../lib/queries';
import { nodeTitle } from '../../../lib/utils';
import { invalidateLinks, useAliases, useBacklinks, useOutgoingLinks } from '../api/queries';
import { useKnowledgeEvent } from '../api/realtime';
import { highlightTerms } from '../lib/snippet';
import { EmptyState } from '../ui/EmptyState';
import { KindBadge } from '../ui/KindBadge';
import { Marked } from '../ui/Marked';
import { NodeIcon } from '../ui/NodeIcon';

interface Group {
  source: Backlink['sourceNode'];
  items: Backlink[];
}

function groupBySource(list: Backlink[]): Group[] {
  const map = new Map<string, Group>();
  for (const b of list) {
    const g = map.get(b.sourceNode.id) ?? { source: b.sourceNode, items: [] };
    g.items.push(b);
    map.set(b.sourceNode.id, g);
  }
  return [...map.values()].sort((a, b) => b.items.length - a.items.length || a.source.title.localeCompare(b.source.title));
}

/** Inspector tab "Backlinks" (contracts §9.1, §10): grouped incoming links + outgoing links. */
export function BacklinksPanel({ workspaceId, nodeId }: { workspaceId: string; nodeId: string }) {
  const qc = useQueryClient();
  const backlinks = useBacklinks(workspaceId, nodeId);
  const outgoing = useOutgoingLinks(workspaceId, nodeId);
  const { data: node } = useNode(workspaceId, nodeId);
  const { data: aliases } = useAliases(workspaceId, nodeId);
  const refetch = useCallback(() => invalidateLinks(qc, workspaceId, nodeId), [qc, workspaceId, nodeId]);
  const live = useKnowledgeEvent('linksChanged', nodeId, refetch);

  const terms = useMemo(() => [node?.title ?? '', ...(aliases ?? [])].filter((t) => t.trim().length > 1), [node?.title, aliases]);
  const groups = useMemo(() => groupBySource(backlinks.data ?? []), [backlinks.data]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const brokenCount = (outgoing.data ?? []).filter((l) => l.broken).length;

  return (
    <div data-testid="backlinks-panel" className="flex flex-col gap-4 text-sm">
      <section>
        <header className="mb-1 flex items-center gap-1 px-1">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Backlinks{backlinks.data ? <span className="ml-1 font-normal normal-case">· {backlinks.data.length}</span> : null}
          </h3>
          <span className="ml-auto" />
          <IconButton label={live ? 'Refresh (live updates on)' : 'Refresh (polls every 30 s)'} size="icon-sm" onClick={refetch}>
            <RefreshCwIcon className={cn('size-3.5', backlinks.isFetching && 'animate-spin')} />
          </IconButton>
        </header>
        {backlinks.isPending ? (
          <div className="flex flex-col gap-2 px-1">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-6 w-1/2" />
          </div>
        ) : backlinks.isError ? (
          <p className="px-1 text-xs text-destructive">Could not load backlinks.</p>
        ) : groups.length === 0 ? (
          <EmptyState
            icon={<Link2Icon />}
            title="No backlinks yet"
            hint={
              <>
                Mention this page from another page with <kbd className="rounded-sm border border-border px-1 font-mono">@</kbd> or{' '}
                <kbd className="rounded-sm border border-border px-1 font-mono">[[</kbd> and it will show up here.
              </>
            }
          />
        ) : (
          <ul className="flex flex-col gap-1">
            {groups.map((g) => {
              const open = !collapsed[g.source.id];
              return (
                <li key={g.source.id} data-testid="backlink-group" className="rounded-md">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setCollapsed((c) => ({ ...c, [g.source.id]: open }))}
                    className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left hover:bg-accent"
                  >
                    <ChevronRightIcon className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} />
                    <NodeIcon icon={g.source.icon} kind={g.source.kind} />
                    <span className="truncate font-medium">{nodeTitle(g.source.title)}</span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">{g.items.length}</span>
                  </button>
                  {open ? (
                    <ul className="ml-3 flex flex-col gap-0.5 border-l border-border pl-2">
                      {g.items.map((b, i) => (
                        <li key={`${b.blockId ?? i}`}>
                          <Link
                            to="/w/$workspaceId/p/$nodeId"
                            params={{ workspaceId, nodeId: b.sourceNode.id }}
                            hash={b.blockId ? `b-${b.blockId}` : undefined}
                            data-testid="backlink-item"
                            className="group flex flex-col gap-1 rounded-md px-2 py-1.5 hover:bg-accent"
                          >
                            <Marked parts={highlightTerms(b.snippet, terms)} className="line-clamp-3 text-[13px] leading-snug text-foreground" />
                            <span className="flex items-center gap-1.5">
                              <KindBadge kind={b.kind} />
                              <ArrowUpRightIcon className="ml-auto size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <header className="mb-1 flex items-center gap-1 px-1">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Outgoing links{outgoing.data ? <span className="ml-1 font-normal normal-case">· {outgoing.data.length}</span> : null}
          </h3>
          {brokenCount ? (
            <span className="ml-auto inline-flex items-center gap-1 rounded-sm bg-[color-mix(in_srgb,var(--destructive)_12%,transparent)] px-1.5 text-[11px] font-medium text-destructive">
              <AlertTriangleIcon className="size-3" /> {brokenCount} broken
            </span>
          ) : null}
        </header>
        {outgoing.isPending ? (
          <Skeleton className="mx-1 h-6 w-1/2" />
        ) : !outgoing.data?.length ? (
          <p className="px-2 py-2 text-xs text-muted-foreground">This page does not link anywhere yet.</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {outgoing.data.map((l, i) => (
              <OutgoingRow key={i} workspaceId={workspaceId} link={l} />
            ))}
          </ul>
        )}
      </section>
      <p className="px-1 text-[11px] text-muted-foreground">Unlinked mentions are coming in a later wave.</p>
    </div>
  );
}

function OutgoingRow({ workspaceId, link }: { workspaceId: string; link: OutgoingLink }) {
  const rowClass = 'flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-accent';
  const label = link.targetNode ? nodeTitle(link.targetNode.title) : link.href ?? 'Unknown target';
  if (link.broken)
    return (
      <li data-testid="outgoing-link" data-broken="true" className={cn(rowClass, 'text-muted-foreground')}>
        <UnlinkIcon className="size-4 shrink-0 text-destructive" />
        <span className="truncate line-through decoration-destructive/60">{label}</span>
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-destructive">Broken</span>
        <KindBadge kind={link.kind} />
      </li>
    );
  if (link.kind === 'url' || !link.targetNode)
    return (
      <li data-testid="outgoing-link">
        <a href={link.href} target="_blank" rel="noreferrer noopener" className={rowClass}>
          <ExternalLinkIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{label}</span>
          <KindBadge kind={link.kind} className="ml-auto" />
        </a>
      </li>
    );
  return (
    <li data-testid="outgoing-link">
      <Link
        to="/w/$workspaceId/p/$nodeId"
        params={{ workspaceId, nodeId: link.targetNode.id }}
        hash={link.targetBlockId ? `b-${link.targetBlockId}` : undefined}
        className={rowClass}
      >
        <NodeIcon icon={link.targetNode.icon} kind={link.targetNode.kind} />
        <span className="truncate">{label}</span>
        <KindBadge kind={link.kind} className="ml-auto" />
      </Link>
    </li>
  );
}
