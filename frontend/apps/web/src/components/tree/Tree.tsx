import { useQueries } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { ChevronRightIcon, MoreHorizontalIcon, PlusIcon } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
  IconButton,
  Menu,
  MenuContent,
  MenuTrigger,
  Skeleton,
  cn,
} from '@nook/ui';
import { TagChips } from '../../features/knowledge';
import { nodesQuery, useMoveNode, useUpdateNode } from '../../lib/queries';
import { nodeTitle } from '../../lib/utils';
import { useUiStore } from '../../stores/ui';
import { computeDrop, flattenTree, INDENT, ROOT_KEY, type DropTarget, type FlatItem, type Level } from './model';
import { NodeIcon } from './NodeIcon';
import { NodeMenuItems, useNodeActions, type NodeActions } from './NodeMenu';

export interface TreeProps {
  workspaceId: string;
  /** Root list filter: `private` = workspace pages you own/edit; `shared` = share-only roots. */
  scope?: 'private' | 'shared';
  emptyText?: string;
}

const ROW_LEFT = 4;

/**
 * Lazily-loaded tree: root + every expanded (and visible) parent is a `nodesQuery`; rows are
 * flattened for a single keyboard-navigable list and a single drag-and-drop context.
 */
function useFlatTree(workspaceId: string, scope: 'private' | 'shared', showArchived: boolean) {
  const expanded = useUiStore((s) => s.expanded);
  const [parents, setParents] = useState<string[]>([]);
  const queries = useQueries({
    queries: [null, ...parents].map((p) => nodesQuery(workspaceId, p, showArchived)),
  });
  const levels = useMemo(() => {
    const m = new Map<string, Level>();
    [null, ...parents].forEach((p, i) => {
      const q = queries[i]!;
      let nodes = q.data;
      if (p === null && nodes) {
        nodes = nodes.filter((n) => (scope === 'shared' ? n.effectiveRole !== 'owner' : n.effectiveRole === 'owner'));
      }
      m.set(p ?? ROOT_KEY, { nodes, isPending: q.isPending });
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parents, scope, ...queries.map((q) => q.data), ...queries.map((q) => q.isPending)]);
  const items = useMemo(() => flattenTree(levels, expanded, showArchived), [levels, expanded, showArchived]);
  // Fixed point: fetch children for every visible expanded node.
  useEffect(() => {
    const wanted = items.filter((i) => i.expanded).map((i) => i.id);
    setParents((prev) => (prev.length === wanted.length && prev.every((p, i) => p === wanted[i]) ? prev : wanted));
  }, [items]);
  const rootPending = queries[0]?.isPending ?? true;
  const rootError = queries[0]?.isError ?? false;
  return { items, rootPending, rootError };
}

export function Tree({ workspaceId, scope = 'private', emptyText }: TreeProps) {
  const showArchived = useUiStore((s) => s.showArchived);
  const { items, rootPending, rootError } = useFlatTree(workspaceId, scope, showArchived);
  const actions = useNodeActions(workspaceId);
  const move = useMoveNode(workspaceId);
  const toggleExpanded = useUiStore((s) => s.toggleExpanded);
  const params = useParams({ strict: false }) as { nodeId?: string };
  const navigate = useNavigate();
  const listRef = useRef<HTMLUListElement>(null);

  // --- drag & drop -----------------------------------------------------------------------------
  const [activeId, setActiveId] = useState<string | null>(null);
  const [drop, setDrop] = useState<DropTarget | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const expandTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] } }),
  );

  useEffect(() => {
    if (!activeId) return;
    const onMove = (e: PointerEvent) => (pointer.current = { x: e.clientX, y: e.clientY });
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [activeId]);

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
    setDrop(null);
    pointer.current = null;
  };

  const onDragMove = (e: DragMoveEvent) => {
    const { active, over, delta } = e;
    if (!over) {
      setDrop(null);
      return;
    }
    const rect = over.rect;
    const translated = active.rect.current.translated;
    const y = pointer.current?.y ?? (translated ? translated.top + translated.height / 2 : rect.top + rect.height / 2);
    const ratio = Math.max(0, Math.min(1, (y - rect.top) / rect.height));
    const next = computeDrop({ items, activeId: String(active.id), overId: String(over.id), ratio, offsetX: delta.x });
    setDrop((prev) =>
      prev && next && prev.kind === next.kind && prev.parentId === next.parentId && prev.overId === next.overId && prev.depth === next.depth
        ? prev
        : next,
    );
    // Hovering "inside" a collapsed parent for a moment expands it (Notion behaviour).
    if (expandTimer.current) clearTimeout(expandTimer.current);
    if (next?.kind === 'inside') {
      const target = items.find((i) => i.id === next.parentId);
      if (target && target.hasChildren && !target.expanded) {
        expandTimer.current = setTimeout(() => toggleExpanded(target.id, true), 700);
      }
    }
  };

  const finish = () => {
    if (expandTimer.current) clearTimeout(expandTimer.current);
    setActiveId(null);
    setDrop(null);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const target = drop;
    const id = String(e.active.id);
    finish();
    if (!target) return;
    move.mutate({ id, parentId: target.parentId, position: target.position });
    if (target.parentId) toggleExpanded(target.parentId, true);
  };

  // --- keyboard navigation (roving focus over the rendered rows) -------------------------------
  const focusRow = useCallback((idx: number) => {
    const rows = listRef.current?.querySelectorAll<HTMLElement>('[data-tree-row]');
    rows?.[Math.max(0, Math.min((rows.length ?? 1) - 1, idx))]?.focus();
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    if (activeId) return; // dnd-kit's keyboard sensor owns the arrows while dragging
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-tree-row]');
    if (!row) return;
    const rows = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[data-tree-row]') ?? []);
    const idx = rows.indexOf(row);
    const item = items[idx];
    if (!item) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focusRow(idx + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusRow(idx - 1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (item.hasChildren && !item.expanded) toggleExpanded(item.id, true);
        else if (item.expanded) focusRow(idx + 1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (item.expanded) toggleExpanded(item.id, false);
        else if (item.parentId) focusRow(items.findIndex((i) => i.id === item.parentId));
        break;
      case 'Home':
        e.preventDefault();
        focusRow(0);
        break;
      case 'End':
        e.preventDefault();
        focusRow(rows.length - 1);
        break;
      case 'Enter':
        e.preventDefault();
        void navigate({ to: '/w/$workspaceId/p/$nodeId', params: { workspaceId, nodeId: item.id } });
        break;
    }
  };

  if (rootPending) {
    return (
      <div className="flex flex-col gap-1.5 px-2 py-1">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-5 w-1/2" />
      </div>
    );
  }
  if (rootError) return <p className="px-2 py-1 text-xs text-danger">Failed to load</p>;
  if (!items.length) {
    return <p className="px-3 py-1 text-xs text-fg-disabled">{emptyText ?? 'No pages yet'}</p>;
  }

  const activeItem = activeId ? items.find((i) => i.id === activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragOver={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={finish}
    >
      <ul
        ref={listRef}
        role="tree"
        aria-label={scope === 'shared' ? 'Shared pages' : 'Private pages'}
        className="relative flex flex-col gap-px"
        onKeyDown={onKeyDown}
        data-testid={`tree-${scope}`}
      >
        {items.map((item, idx) => (
          <TreeRow
            key={item.id}
            item={item}
            actions={actions}
            active={params.nodeId === item.id}
            focusable={idx === 0}
            dragging={activeId === item.id}
            drop={drop?.overId === item.id ? drop : null}
            dropInside={drop?.kind === 'inside' && drop.parentId === item.id}
            onToggle={() => toggleExpanded(item.id)}
          />
        ))}
      </ul>
      <DragOverlay dropAnimation={null}>
        {activeItem ? (
          <div className="flex h-7 w-[220px] items-center gap-1.5 rounded-[var(--radius-sm)] bg-bg px-2 text-sm text-fg shadow-[var(--shadow-popover)]">
            <NodeIcon icon={activeItem.node.icon} kind={activeItem.node.kind} size={18} />
            <span className="truncate">{nodeTitle(activeItem.node.title)}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

interface TreeRowProps {
  item: FlatItem;
  actions: NodeActions;
  active: boolean;
  focusable: boolean;
  dragging: boolean;
  drop: DropTarget | null;
  dropInside: boolean;
  onToggle: () => void;
}

function TreeRow({ item, actions, active, focusable, dragging, drop, dropInside, onToggle }: TreeRowProps) {
  const { node, depth } = item;
  const [renaming, setRenaming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const update = useUpdateNode(node.workspaceId);
  const { attributes, listeners, setNodeRef: setDragRef } = useDraggable({ id: item.id, disabled: renaming });
  const { setNodeRef: setDropRef } = useDroppable({ id: item.id });
  const setRefs = useCallback(
    (el: HTMLElement | null) => {
      setDragRef(el);
      setDropRef(el);
    },
    [setDragRef, setDropRef],
  );
  const paddingLeft = ROW_LEFT + depth * INDENT;
  const lineLeft = drop ? ROW_LEFT + drop.depth * INDENT + 4 : 0;

  const guides: ReactNode[] = [];
  for (let d = 1; d <= depth; d++) {
    guides.push(<span key={d} className="nook-tree-guide" style={{ left: ROW_LEFT + (d - 1) * INDENT + 10 }} />);
  }

  return (
    <li role="treeitem" aria-expanded={item.hasChildren ? item.expanded : undefined} aria-selected={active} className="relative">
      <ContextMenu>
        <ContextMenuTrigger
          ref={setRefs}
          data-tree-row
          data-testid="tree-item"
          data-node-id={item.id}
          tabIndex={focusable ? 0 : -1}
          aria-describedby={attributes['aria-describedby']}
          {...listeners}
          className={cn(
            'group relative flex h-7 w-full items-center gap-1 rounded-[var(--radius-sm)] pr-1 text-sm text-sidebar-foreground outline-none transition-colors duration-[var(--duration)] hover:bg-bg-hover focus-visible:ring-2 focus-visible:ring-ring',
            active && 'bg-bg-active font-medium text-fg',
            dragging && 'opacity-40',
            dropInside && 'bg-brand/10 ring-2 ring-brand/60 ring-inset',
            item.archived && 'opacity-50',
            menuOpen && 'bg-bg-hover',
          )}
          style={{ paddingLeft }}
        >
          {guides}
          {/* Icon slot: shows the page icon; on hover it turns into the expand toggle (when it has children). */}
          <span className="relative flex size-5 shrink-0 items-center justify-center">
            <span className={cn('absolute inset-0 flex items-center justify-center', item.hasChildren && 'group-hover:opacity-0')}>
              <NodeIcon icon={node.icon} kind={node.kind} size={18} />
            </span>
            {item.hasChildren ? (
              <button
                type="button"
                aria-label={item.expanded ? 'Collapse' : 'Expand'}
                tabIndex={-1}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggle();
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="absolute inset-0 flex items-center justify-center rounded-[var(--radius-sm)] text-fg-muted opacity-0 hover:bg-bg-active hover:text-fg group-hover:opacity-100"
              >
                <ChevronRightIcon
                  className={cn('size-4 transition-transform duration-[var(--duration)]', item.expanded && 'rotate-90')}
                />
              </button>
            ) : null}
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
              tabIndex={-1}
              draggable={false}
              className="min-w-0 flex-1 truncate py-1 outline-none"
              onDoubleClick={(e) => {
                e.preventDefault();
                if (node.effectiveRole !== 'viewer') setRenaming(true);
              }}
            >
              {nodeTitle(node.title)}
              {item.archived ? <span className="ml-1 text-[11px] text-fg-muted">(archived)</span> : null}
            </Link>
          )}
          {/* Owned by frontend-knowledge (contracts §10); renders nothing until that slice lands. */}
          <TagChips workspaceId={node.workspaceId} nodeId={node.id} compact />
          <span
            className={cn(
              'ml-auto flex shrink-0 items-center gap-px opacity-0 transition-opacity duration-[var(--duration)] group-hover:opacity-100 focus-within:opacity-100',
              menuOpen && 'opacity-100',
            )}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <Menu open={menuOpen} onOpenChange={setMenuOpen}>
              <MenuTrigger
                aria-label="Page options"
                data-testid="tree-item-menu"
                className="flex size-5 items-center justify-center rounded-[var(--radius-sm)] text-fg-muted hover:bg-bg-active hover:text-fg"
              >
                <MoreHorizontalIcon className="size-4" />
              </MenuTrigger>
              <MenuContent className="w-56" side="right" align="start">
                <NodeMenuItems node={node} actions={actions} onRename={() => setRenaming(true)} />
              </MenuContent>
            </Menu>
            {node.effectiveRole !== 'viewer' ? (
              <IconButton
                label="Add a page inside"
                size="icon-sm"
                className="size-5 text-fg-muted hover:bg-bg-active"
                onClick={() => void actions.addInside(node)}
              >
                <PlusIcon className="size-4" />
              </IconButton>
            ) : null}
          </span>
          {drop && drop.kind !== 'inside' ? (
            <span
              className="nook-drop-line"
              style={{ left: lineLeft, [drop.kind === 'before' ? 'top' : 'bottom']: -1 }}
              data-testid="drop-indicator"
            />
          ) : null}
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <NodeMenuItems node={node} actions={actions} onRename={() => setRenaming(true)} />
        </ContextMenuContent>
      </ContextMenu>
      {item.loading ? (
        <div className="py-1" style={{ paddingLeft: paddingLeft + INDENT + 24 }}>
          <Skeleton className="h-4 w-2/3" />
        </div>
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
    e.stopPropagation();
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
      onPointerDown={(e) => e.stopPropagation()}
      className="h-6 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-brand bg-bg px-1 text-sm text-fg outline-none"
    />
  );
}
