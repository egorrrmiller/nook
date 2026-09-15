import { useQueries } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ChevronRightIcon } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import type { Node, NodeSummary } from '@nook/api-client';
import {
  Menu,
  MenuContent,
  MenuGroup,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  Skeleton,
  cn,
} from '@nook/ui';
import { nodeQuery, nodesQuery, useAncestors, useNode } from '../../lib/queries';
import { nodeTitle } from '../../lib/utils';
import { NodeIcon } from '../tree/NodeIcon';

/**
 * Notion 04.2026 breadcrumbs: root → … → page, each crumb opening a dropdown of its siblings.
 * Titles are read back through the node cache so a rename in the editor updates them live.
 */
export function Breadcrumbs({ workspaceId, nodeId }: { workspaceId: string; nodeId: string }) {
  const { data: ancestors, isPending } = useAncestors(workspaceId, nodeId);
  const { data: node } = useNode(workspaceId, nodeId);

  const chain = useMemo<NodeSummary[]>(() => {
    const list: NodeSummary[] = [...(ancestors ?? [])];
    if (node) list.push({ id: node.id, title: node.title, icon: node.icon, kind: node.kind, parentId: node.parentId });
    return list;
  }, [ancestors, node]);

  // Observe every crumb's node query: a rename patches that cache entry, so the trail updates live
  // (the wave-0 bug: breadcrumbs kept the title the ancestors payload was fetched with).
  const live = useQueries({
    queries: chain.map((c) => nodeQuery(workspaceId, c.id)),
    combine: (results) => results.map((r) => r.data),
  });
  const crumbs = useMemo<NodeSummary[]>(
    () =>
      chain.map((c, i) => {
        const n: Node | undefined = live[i];
        return n ? { id: n.id, title: n.title, icon: n.icon, kind: n.kind, parentId: n.parentId } : c;
      }),
    [chain, live],
  );

  if (isPending && !ancestors) return <Skeleton className="h-4 w-40" />;

  const visible = crumbs.length > 4 ? [crumbs[0]!, ...crumbs.slice(-3)] : crumbs;
  const elided = crumbs.length > 4 ? crumbs.slice(1, -3) : [];

  return (
    <nav aria-label="Breadcrumb" className="nook-breadcrumbs flex min-w-0 items-center gap-0.5" data-testid="breadcrumbs">
      {visible.map((crumb, i) => (
        <Fragment key={crumb.id}>
          {i > 0 ? <Separator /> : null}
          {i === 1 && elided.length ? (
            <>
              <ElidedCrumbs workspaceId={workspaceId} crumbs={elided} />
              <Separator />
            </>
          ) : null}
          <Crumb
            workspaceId={workspaceId}
            crumb={crumb}
            last={i === visible.length - 1}
            parentId={crumb.parentId ?? null}
          />
        </Fragment>
      ))}
    </nav>
  );
}

function Separator() {
  return <ChevronRightIcon className="size-3.5 shrink-0 text-fg-disabled" aria-hidden />;
}

function Crumb({
  workspaceId,
  crumb,
  last,
  parentId,
}: {
  workspaceId: string;
  crumb: NodeSummary;
  last: boolean;
  parentId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  // Siblings are only fetched once the dropdown is opened.
  const { data: siblings } = useSiblings(workspaceId, parentId, open);

  return (
    <Menu open={open} onOpenChange={setOpen}>
      <MenuTrigger
        data-testid={last ? 'breadcrumb-current' : 'breadcrumb-crumb'}
        aria-current={last ? 'page' : undefined}
        title={nodeTitle(crumb.title)}
        className={cn(
          'nook-breadcrumbs__crumb flex h-7 max-w-[220px] shrink items-center gap-1 rounded-[var(--radius-sm)] px-1.5 text-sm transition-colors duration-[var(--duration)] hover:bg-bg-hover',
          last ? 'font-medium text-fg' : 'text-fg-secondary',
        )}
      >
        <NodeIcon icon={crumb.icon} kind={crumb.kind} size={16} />
        <span className="truncate">{nodeTitle(crumb.title)}</span>
      </MenuTrigger>
      <MenuContent className="max-h-80 w-64 overflow-y-auto">
        {/* Base UI requires GroupLabel to live inside a Group. */}
        <MenuGroup>
          <MenuLabel>{parentId ? 'Sibling pages' : 'Top-level pages'}</MenuLabel>
          {(siblings ?? []).map((s) => (
            <MenuItem
              key={s.id}
              onClick={() => navigate({ to: '/w/$workspaceId/p/$nodeId', params: { workspaceId, nodeId: s.id } })}
              className={cn(s.id === crumb.id && 'bg-bg-hover font-medium')}
            >
              <NodeIcon icon={s.icon} kind={s.kind} size={16} />
              <span className="truncate">{nodeTitle(s.title)}</span>
            </MenuItem>
          ))}
          {!siblings?.length ? <MenuItem disabled>No sibling pages</MenuItem> : null}
        </MenuGroup>
        <MenuSeparator />
        <MenuItem onClick={() => navigate({ to: '/w/$workspaceId/p/$nodeId', params: { workspaceId, nodeId: crumb.id } })}>
          Open “{nodeTitle(crumb.title)}”
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

function useSiblings(workspaceId: string, parentId: string | null, enabled: boolean) {
  return useQueries({
    queries: [{ ...nodesQuery(workspaceId, parentId), enabled }],
    combine: ([q]) => ({ data: q?.data }),
  });
}

function ElidedCrumbs({ workspaceId, crumbs }: { workspaceId: string; crumbs: NodeSummary[] }) {
  return (
    <Menu>
      <MenuTrigger
        aria-label="Show hidden breadcrumbs"
        className="nook-breadcrumbs__ellipsis flex h-7 items-center rounded-[var(--radius-sm)] px-1.5 text-sm text-fg-secondary hover:bg-bg-hover"
      >
        …
      </MenuTrigger>
      <MenuContent className="w-56">
        {crumbs.map((c) => (
          <MenuItem key={c.id} render={<Link to="/w/$workspaceId/p/$nodeId" params={{ workspaceId, nodeId: c.id }} />}>
            <NodeIcon icon={c.icon} kind={c.kind} size={16} />
            <span className="truncate">{nodeTitle(c.title)}</span>
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}
