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
import { useState } from 'react';
import type { Favorite } from '@nook/api-client';
import { Menu, MenuContent, MenuTrigger, Skeleton, cn } from '@nook/ui';
import { positionAt } from '../../lib/fractional';
import { useFavorites, useReorderFavorite } from '../../lib/queries';
import { nodeTitle } from '../../lib/utils';
import { NodeIcon } from '../tree/NodeIcon';
import { NodeMenuItems, useNodeActions } from '../tree/NodeMenu';

/** Server-backed favourites (§7.3) with drag-to-reorder (fractional `position`). */
export function FavoritesList({ workspaceId }: { workspaceId: string }) {
  const { data, isPending } = useFavorites(workspaceId);
  const reorder = useReorderFavorite(workspaceId);
  const actions = useNodeActions(workspaceId);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (isPending) return <Skeleton className="mx-2 my-1 h-5 w-2/3" />;
  const items = data ?? [];
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
        <ul className="flex flex-col gap-px" data-testid="favorites-list" aria-label="Favorites">
          {items.map((f) => (
            <FavoriteRow key={f.nodeId} fav={f} actions={actions} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
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
        'group relative flex h-7 items-center gap-1 rounded-[var(--radius-sm)] pr-1 pl-1 text-sm text-sidebar-foreground transition-colors duration-[var(--duration)] hover:bg-bg-hover',
        active && 'bg-bg-active font-medium text-fg',
        isDragging && 'z-10 bg-bg opacity-90 shadow-[var(--shadow-popover)]',
        menuOpen && 'bg-bg-hover',
      )}
      data-testid="favorite-item"
      {...attributes}
      {...listeners}
      role="listitem"
      aria-roledescription="favourite"
    >
      <NodeIcon icon={node.icon} kind={node.kind} size={18} className="ml-0.5" />
      <Link
        to="/w/$workspaceId/p/$nodeId"
        params={{ workspaceId: node.workspaceId, nodeId: node.id }}
        className="min-w-0 flex-1 truncate py-1 outline-none"
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
            className="flex size-5 items-center justify-center rounded-[var(--radius-sm)] text-fg-muted hover:bg-bg-active hover:text-fg"
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
