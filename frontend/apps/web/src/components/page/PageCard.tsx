import { Link } from '@tanstack/react-router';
import type { Node } from '@nook/api-client';
import { FileTextIcon } from 'lucide-react';
import { nodeTitle } from '../../lib/utils';

export function PageCard({ node, workspaceId }: { node: Node; workspaceId: string }) {
  return (
    <Link
      to="/w/$workspaceId/p/$nodeId"
      params={{ workspaceId, nodeId: node.id }}
      className="flex h-24 flex-col justify-end rounded-[var(--radius)] border border-border bg-bg p-3 shadow-[var(--shadow-sm)] transition-colors hover:bg-bg-hover"
    >
      <span className="text-xl">
        {node.icon?.type === 'emoji' ? node.icon.value : <FileTextIcon className="size-5 text-fg-muted" />}
      </span>
      <span className="mt-1 truncate text-sm font-medium">{nodeTitle(node.title)}</span>
    </Link>
  );
}
