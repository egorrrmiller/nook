import { Link } from '@tanstack/react-router';
import { XIcon, Maximize2Icon } from 'lucide-react';
import { IconButton, Skeleton } from '@nook/ui';
import { useNode } from '../../lib/queries';
import { useUiStore } from '../../stores/ui';
import { nodeTitle } from '../../lib/utils';

/** Right-hand "peek" slot. Wave 1 replaces the body with a full page preview / DB row editor. */
export function PeekPanel({ workspaceId, nodeId }: { workspaceId: string; nodeId: string }) {
  const setPeek = useUiStore((s) => s.setPeek);
  const { data: node, isPending } = useNode(workspaceId, nodeId);
  return (
    <aside
      data-testid="peek-panel"
      aria-label="Side peek"
      className="flex w-[min(480px,45vw)] shrink-0 flex-col border-l border-border bg-bg"
    >
      <div className="flex h-[var(--topbar-height)] items-center gap-1 px-2">
        <Link
          to="/w/$workspaceId/p/$nodeId"
          params={{ workspaceId, nodeId }}
          onClick={() => setPeek(null)}
        >
          <IconButton label="Open as page">
            <Maximize2Icon />
          </IconButton>
        </Link>
        <span className="ml-auto" />
        <IconButton label="Close peek" onClick={() => setPeek(null)}>
          <XIcon />
        </IconButton>
      </div>
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {isPending ? (
          <Skeleton className="h-8 w-2/3" />
        ) : (
          <>
            <h2 className="text-2xl font-bold">
              {node?.icon?.type === 'emoji' ? (
                <span className="mr-2">{node.icon.value}</span>
              ) : null}
              {nodeTitle(node?.title)}
            </h2>
            <p className="mt-4 text-sm text-fg-muted">Peek preview will render the editor here.</p>
          </>
        )}
      </div>
    </aside>
  );
}
