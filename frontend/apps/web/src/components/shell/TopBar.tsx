import { Link, useParams } from '@tanstack/react-router';
import { ChevronsRightIcon, MoreHorizontalIcon, PanelRightIcon } from 'lucide-react';
import { Fragment } from 'react';
import { IconButton, Skeleton, Tooltip } from '@nook/ui';
import { useUiStore } from '../../stores/ui';
import { useAncestors } from '../../lib/ancestors';
import { nodeTitle, modKey } from '../../lib/utils';

export function TopBar({ workspaceId }: { workspaceId: string }) {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const peekNodeId = useUiStore((s) => s.peekNodeId);
  const setPeek = useUiStore((s) => s.setPeek);
  const params = useParams({ strict: false }) as { nodeId?: string };
  const nodeId = params.nodeId ?? null;
  const { data: chain, isPending } = useAncestors(workspaceId, nodeId);

  return (
    <header
      data-testid="topbar"
      className="flex h-[var(--topbar-height)] shrink-0 items-center gap-1 px-2 text-sm"
    >
      {!sidebarOpen ? (
        <Tooltip content={`Open sidebar (${modKey()}\\)`}>
          <IconButton label="Open sidebar" onClick={toggleSidebar}>
            <ChevronsRightIcon />
          </IconButton>
        </Tooltip>
      ) : null}
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 px-1">
        {nodeId ? (
          isPending ? (
            <Skeleton className="h-4 w-32" />
          ) : (
            chain?.map((n, i) => (
              <Fragment key={n.id}>
                {i > 0 ? <span className="text-fg-disabled">/</span> : null}
                <Link
                  to="/w/$workspaceId/p/$nodeId"
                  params={{ workspaceId, nodeId: n.id }}
                  className="max-w-[200px] truncate rounded-[var(--radius-sm)] px-1.5 py-0.5 text-fg hover:bg-bg-hover"
                >
                  {n.icon?.type === 'emoji' ? <span className="mr-1">{n.icon.value}</span> : null}
                  {nodeTitle(n.title)}
                </Link>
              </Fragment>
            ))
          )
        ) : (
          <span className="px-1.5 text-fg-secondary">Home</span>
        )}
      </nav>
      <div className="ml-auto flex items-center gap-1">
        {nodeId ? (
          <Tooltip content={peekNodeId ? 'Close side peek' : 'Open in side peek'}>
            <IconButton
              label="Toggle side peek"
              onClick={() => setPeek(peekNodeId ? null : nodeId)}
            >
              <PanelRightIcon />
            </IconButton>
          </Tooltip>
        ) : null}
        <IconButton label="More" onClick={() => {}}>
          <MoreHorizontalIcon />
        </IconButton>
      </div>
    </header>
  );
}
