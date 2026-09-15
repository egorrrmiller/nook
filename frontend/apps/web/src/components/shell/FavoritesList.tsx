import { Link, useParams } from '@tanstack/react-router';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MoreHorizontalIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Favorite, Node } from '@nook/api-client';
import { useQueries } from '@tanstack/react-query';
import { Menu, MenuContent, MenuTrigger, Skeleton, cn } from '@nook/ui';
import { positionAt } from '../../lib/fractional';
import { nodesQuery, useFavorites, useReorderFavorite } from '../../lib/queries';
import { nodeTitle } from '../../lib/utils';
import { NodeIcon } from '../tree/NodeIcon';
import { NodeMenuItems, useNodeActions } from '../tree/NodeMenu';

/** Server-backed favourites (§7.3) with drag-to-reorder (fractional `position`). */
export function FavoritesList({ workspaceId }: { workspaceId: string }) {
  const { data, isPending } = useFavorites(workspaceId);
  const reorder = useReorderFavorite(workspaceId);
  const actions = useNodeActions(workspaceId);
  const items = data ?? [];
  const tree = useFavoriteTree(workspaceId, items);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (isPending) return <Skeleton className="mx-2 my-1 h-5 w-2/3" />;
  if (!items.length) {
    return <p className="px-3 py-1 text-xs text-fg-disabled">Star pages to see them here.</p>;
  }

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = items.findIndex((f) => f.nodeId === active.id);
    const to = items.findIndex((f) => f.nodeId === over.id);
    if (from < 0 || to < 0) return;
    const rest = items.filter((f) => f.nodeId !== active.id).map((f) => f.position);
    const position = positionAt(rest, to);
    reorder.mutate({ nodeId: String(active.id), position });
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((f) => f.nodeId)} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-col gap-0.5" data-testid="favorites-list" aria-label="Favorites">
          {tree.rows.map((row) => row.favorite ? (
            <FavoriteRow key={row.node.id} fav={row.favorite} actions={actions} />
          ) : (
            <FavoriteDescendantRow key={row.node.id} node={row.node} depth={row.depth} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

interface FavoriteTreeRow {
  node: Node;
  depth: number;
  favorite?: Favorite;
}

/** Loads every live descendant of a pinned folder so Favorites behaves like a pinned tree, not a flat bookmark list. */
function useFavoriteTree(workspaceId: string, favorites: Favorite[]) {
  const rootIds = useMemo(() => favorites.map((favorite) => favorite.nodeId), [favorites]);
  const [parents, setParents] = useState<string[]>(rootIds);
  const requestedParents = useMemo(() => Array.from(new Set([...rootIds, ...parents])), [rootIds, parents]);
  const queries = useQueries({
    queries: requestedParents.map((parentId) => nodesQuery(workspaceId, parentId, true)),
  });
  const childrenByParent = useMemo(() => {
    const result = new Map<string, Node[]>();
    requestedParents.forEach((parentId, index) => result.set(parentId, queries[index]?.data ?? []));
    return result;
  }, [requestedParents, ...queries.map((query) => query.data)]);
  const nextParents = useMemo(() => {
    const result: string[] = [];
    for (const children of childrenByParent.values()) {
      for (const node of children) if (!node.deletedAt && node.hasChildren !== false) result.push(node.id);
    }
    return result;
  }, [childrenByParent]);

  useEffect(() => {
    setParents((current) => current.length === nextParents.length && current.every((id, index) => id === nextParents[index]) ? current : nextParents);
  }, [nextParents]);

  const rows = useMemo(() => {
    const roots = new Map(favorites.map((favorite) => [favorite.nodeId, favorite]));
    const result: FavoriteTreeRow[] = [];
    const visiting = new Set<string>();
    const walk = (parentId: string, depth: number) => {
      if (!visiting.add(parentId)) return;
      for (const node of childrenByParent.get(parentId) ?? []) {
        if (node.deletedAt || roots.has(node.id)) continue;
        result.push({ node, depth });
        walk(node.id, depth + 1);
      }
      visiting.delete(parentId);
    };
    for (const favorite of favorites) {
      result.push({ node: favorite.node, depth: 0, favorite });
      walk(favorite.nodeId, 1);
    }
    return result;
  }, [childrenByParent, favorites]);

  return { rows };
}

function FavoriteDescendantRow({ node, depth }: { node: Node; depth: number }) {
  const params = useParams({ strict: false }) as { nodeId?: string };
  const active = params.nodeId === node.id;
  return (
    <li
      className={cn(
        'flex h-8 items-center gap-2 rounded-[var(--radius-md)] pr-1.5 text-[13px] text-sidebar-foreground transition-colors duration-[var(--duration)] hover:bg-bg-hover',
        active && 'bg-bg-active font-medium text-fg shadow-[inset_2px_0_0_var(--primary)]',
        node.archivedAt && 'opacity-50',
      )}
      style={{ paddingLeft: 8 + depth * 16 }}
      data-testid="favorite-descendant-item"
    >
      <NodeIcon icon={node.icon} kind={node.kind} size={18} className="shrink-0" />
      <Link
        to="/w/$workspaceId/p/$nodeId"
        params={{ workspaceId: node.workspaceId, nodeId: node.id }}
        className="min-w-0 flex-1 truncate py-1.5 outline-none"
      >
        {nodeTitle(node.title)}
      </Link>
    </li>
  );
}

function FavoriteRow({ fav, actions }: { fav: Favorite; actions: ReturnType<typeof useNodeActions> }) {
  const params = useParams({ strict: false }) as { nodeId?: string };
  const [menuOpen, setMenuOpen] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: fav.nodeId });
  const active = params.nodeId === fav.nodeId;
  const { node } = fav;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'group relative flex h-9 items-center gap-2 rounded-[var(--radius-md)] pr-1.5 pl-2 text-[13px] text-sidebar-foreground transition-[background,color,transform] duration-[var(--duration)] hover:bg-bg-hover active:scale-[0.995]',
        active && 'bg-bg-active font-medium text-fg shadow-[inset_2px_0_0_var(--primary)]',
        isDragging && 'z-10 bg-bg opacity-90 shadow-[var(--shadow-popover)]',
        menuOpen && 'bg-bg-hover',
      )}
      data-testid="favorite-item"
      {...attributes}
      {...listeners}
      role="listitem"
      aria-roledescription="favourite"
    >
      <NodeIcon icon={node.icon} kind={node.kind} size={19} className="ml-0.5" />
      <Link
        to="/w/$workspaceId/p/$nodeId"
        params={{ workspaceId: node.workspaceId, nodeId: node.id }}
        className="min-w-0 flex-1 truncate py-1.5 outline-none"
        draggable={false}
        tabIndex={-1}
      >
        {nodeTitle(node.title)}
      </Link>
      <span
        className={cn('ml-auto opacity-0 transition-opacity group-hover:opacity-100', menuOpen && 'opacity-100')}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <Menu open={menuOpen} onOpenChange={setMenuOpen}>
          <MenuTrigger
            aria-label="Favorite options"
            className="flex size-6 items-center justify-center rounded-[var(--radius-sm)] text-fg-muted hover:bg-bg-active hover:text-fg"
          >
            <MoreHorizontalIcon className="size-4" />
          </MenuTrigger>
          <MenuContent className="w-56" side="right" align="start">
            <NodeMenuItems node={node} actions={actions} hide={{ rename: true }} />
          </MenuContent>
        </Menu>
      </span>
    </li>
  );
}
