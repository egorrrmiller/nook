import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  ChevronRightIcon,
  CopyIcon,
  FileTextIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react';
import type { Node } from '@nook/api-client';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
  IconButton,
  MenuItem,
  MenuSeparator,
  Skeleton,
  cn,
} from '@nook/ui';
import { useCreateNode, useDeleteNode, useNodes, useUpdateNode } from '../../lib/queries';
import { nodeTitle } from '../../lib/utils';
import { toast } from '../../stores/toast';

export interface TreeProps {
  workspaceId: string;
  parentId: string | null;
  depth: number;
}

/** Lazily-loaded tree level: children are fetched only when a node is expanded. */
export function Tree({ workspaceId, parentId, depth }: TreeProps) {
  const { data, isPending, isError } = useNodes(workspaceId, parentId);
  if (isPending) {
    return (
      <div className="flex flex-col gap-1 py-1" style={{ paddingLeft: depth * 12 + 8 }}>
        <Skeleton className="h-5 w-3/4" />
        {depth === 0 ? <Skeleton className="h-5 w-1/2" /> : null}
      </div>
    );
  }
  if (isError) {
    return (
      <p className="px-2 py-1 text-xs text-danger" style={{ paddingLeft: depth * 12 + 8 }}>
        Failed to load
      </p>
    );
  }
  if (!data.length) {
    return (
      <p className="px-2 py-1 text-xs text-fg-disabled" style={{ paddingLeft: depth * 12 + 8 }}>
        {depth === 0 ? 'No pages yet' : 'No pages inside'}
      </p>
    );
  }
  return (
    <ul role={depth === 0 ? 'tree' : 'group'} className="flex flex-col gap-px">
      {data.map((node) => (
        <TreeItem key={node.id} node={node} depth={depth} />
      ))}
    </ul>
  );
}

function TreeItem({ node, depth }: { node: Node; depth: number }) {
  const params = useParams({ strict: false }) as { nodeId?: string };
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const update = useUpdateNode(node.workspaceId);
  const create = useCreateNode(node.workspaceId);
  const remove = useDeleteNode(node.workspaceId);
  const active = params.nodeId === node.id;

  async function addChild() {
    const child = await create.mutateAsync({ parentId: node.id, kind: 'page', title: '' });
    setExpanded(true);
    await navigate({
      to: '/w/$workspaceId/p/$nodeId',
      params: { workspaceId: node.workspaceId, nodeId: child.id },
    });
  }

  async function del() {
    await remove.mutateAsync(node.id);
    toast('Moved to trash');
    if (active)
      await navigate({ to: '/w/$workspaceId', params: { workspaceId: node.workspaceId } });
  }

  return (
    <li role="treeitem" aria-expanded={expanded} aria-selected={active}>
      <ContextMenu>
        <ContextMenuTrigger
          className={cn(
            'group flex h-7 items-center gap-1 rounded-[var(--radius-sm)] pr-1 text-sm text-fg-secondary hover:bg-bg-hover',
            active && 'bg-bg-active text-fg',
          )}
          style={{ paddingLeft: depth * 12 + 4 }}
          data-testid="tree-item"
        >
          <IconButton
            label={expanded ? 'Collapse' : 'Expand'}
            size="icon-sm"
            className="size-5 shrink-0"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
          >
            <ChevronRightIcon
              className={cn(
                'size-3.5 transition-transform duration-[var(--duration)]',
                expanded && 'rotate-90',
              )}
            />
          </IconButton>
          <span className="flex size-5 shrink-0 items-center justify-center text-[15px] leading-none">
            {node.icon?.type === 'emoji' ? (
              node.icon.value
            ) : (
              <FileTextIcon className="size-4 text-fg-muted" />
            )}
          </span>
          {renaming ? (
            <RenameInput
              value={node.title}
              onCancel={() => setRenaming(false)}
              onCommit={async (title) => {
                setRenaming(false);
                if (title !== node.title) await update.mutateAsync({ id: node.id, title });
              }}
            />
          ) : (
            <Link
              to="/w/$workspaceId/p/$nodeId"
              params={{ workspaceId: node.workspaceId, nodeId: node.id }}
              className="min-w-0 flex-1 truncate py-1 outline-none"
              onDoubleClick={(e) => {
                e.preventDefault();
                setRenaming(true);
              }}
            >
              {nodeTitle(node.title)}
            </Link>
          )}
          <span className="ml-auto hidden shrink-0 items-center group-hover:flex">
            <IconButton label="Add a page inside" size="icon-sm" className="size-5" onClick={addChild}>
              <PlusIcon />
            </IconButton>
          </span>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <MenuItem onClick={() => setRenaming(true)}>
            <PencilIcon /> Rename
          </MenuItem>
          <MenuItem onClick={addChild}>
            <PlusIcon /> Add page inside
          </MenuItem>
          <MenuItem onClick={() => toast('Duplicate is coming in a later wave')}>
            <CopyIcon /> Duplicate
          </MenuItem>
          <MenuSeparator />
          <MenuItem className="text-danger" onClick={del}>
            <Trash2Icon className="!text-danger" /> Delete
          </MenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {expanded ? (
        <Tree workspaceId={node.workspaceId} parentId={node.id} depth={depth + 1} />
      ) : null}
    </li>
  );
}

function RenameInput({
  value,
  onCommit,
  onCancel,
}: {
  value: string;
  onCommit: (v: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [v, setV] = useState(value);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') onCommit(v.trim());
    if (e.key === 'Escape') onCancel();
  };
  return (
    <input
      ref={ref}
      aria-label="Rename page"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={onKey}
      onBlur={() => onCommit(v.trim())}
      onClick={(e) => e.stopPropagation()}
      className="h-6 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-brand bg-bg px-1 text-sm text-fg outline-none"
    />
  );
}
