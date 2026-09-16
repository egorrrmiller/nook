import { useNavigate, useParams } from '@tanstack/react-router';
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  CopyIcon,
  CornerUpRightIcon,
  FolderPlusIcon,
  LinkIcon,
  PencilIcon,
  PlusIcon,
  StarIcon,
  StarOffIcon,
  Trash2Icon,
} from 'lucide-react';
import { useCallback, useMemo } from 'react';
import type { Node } from '@nook/api-client';
import { MenuItem, MenuSeparator } from '@nook/ui';
import {
  useArchiveNode,
  useCreateNode,
  useDeleteNode,
  useDuplicateNode,
  useFavorites,
  useSetFavorite,
} from '../../lib/queries';
import { copyPageLink, modKey, nodeTitle } from '../../lib/utils';
import { toast } from '../../stores/toast';
import { useUiStore } from '../../stores/ui';

/** Page actions shared by the sidebar rows, favourites, context menus and the top-bar `⋯` menu. */
export function useNodeActions(workspaceId: string) {
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { nodeId?: string };
  const create = useCreateNode(workspaceId);
  const duplicate = useDuplicateNode(workspaceId);
  const archive = useArchiveNode(workspaceId);
  const remove = useDeleteNode(workspaceId);
  const setFavorite = useSetFavorite(workspaceId);
  const { data: favorites } = useFavorites(workspaceId);
  const setMoveNodeId = useUiStore((s) => s.setMoveNodeId);
  const toggleExpanded = useUiStore((s) => s.toggleExpanded);
  const favoriteIds = useMemo(() => new Set((favorites ?? []).map((f) => f.nodeId)), [favorites]);

  const open = useCallback(
    (nodeId: string) =>
      navigate({ to: '/w/$workspaceId/p/$nodeId', params: { workspaceId, nodeId } }),
    [navigate, workspaceId],
  );

  return {
    isFavorite: (id: string) => favoriteIds.has(id),
    open,
    addInside: async (node: Node, kind: 'page' | 'folder' = 'page') => {
      const child = await create.mutateAsync({ parentId: node.id, kind, title: '' });
      toggleExpanded(node.id, true);
      await open(child.id);
    },
    duplicate: async (node: Node) => {
      const dup = await duplicate.mutateAsync({ id: node.id });
      toast(`Duplicated “${nodeTitle(node.title)}”`);
      await open(dup.id);
    },
    toggleFavorite: (node: Node) => {
      const favorite = !favoriteIds.has(node.id);
      setFavorite.mutate({ node, favorite });
      toast(favorite ? 'Added to Favorites' : 'Removed from Favorites');
    },
    moveTo: (node: Node) => setMoveNodeId(node.id),
    copyLink: (node: Node) => copyPageLink(node),
    toggleArchive: (node: Node) => {
      const archived = !node.archivedAt;
      archive.mutate(
        { id: node.id, archived },
        { onSuccess: () => toast(archived ? 'Page archived' : 'Page unarchived') },
      );
    },
    remove: async (node: Node) => {
      await remove.mutateAsync(node.id);
      toast('Moved to trash');
      if (params.nodeId === node.id)
        await navigate({ to: '/w/$workspaceId', params: { workspaceId } });
    },
  };
}

export type NodeActions = ReturnType<typeof useNodeActions>;

export interface NodeMenuItemsProps {
  node: Node;
  actions: NodeActions;
  onRename?: () => void;
  /** Hide the items that make no sense in the current surface. */
  hide?: Partial<
    Record<
      | 'rename'
      | 'addInside'
      | 'duplicate'
      | 'favorite'
      | 'moveTo'
      | 'copyLink'
      | 'archive'
      | 'delete',
      boolean
    >
  >;
}

/** Menu items (to embed in `MenuContent` / `ContextMenuContent`). */
export function NodeMenuItems({ node, actions, onRename, hide = {} }: NodeMenuItemsProps) {
  const readOnly = node.effectiveRole === 'viewer';
  const fav = actions.isFavorite(node.id);
  return (
    <>
      {!hide.favorite ? (
        <MenuItem onClick={() => actions.toggleFavorite(node)} data-testid="menu-favorite">
          {fav ? <StarOffIcon /> : <StarIcon />}
          {fav ? 'Remove from Favorites' : 'Add to Favorites'}
        </MenuItem>
      ) : null}
      {!hide.copyLink ? (
        <MenuItem onClick={() => void actions.copyLink(node)}>
          <LinkIcon /> Copy link
        </MenuItem>
      ) : null}
      {!hide.duplicate && !readOnly ? (
        <MenuItem onClick={() => void actions.duplicate(node)} shortcut={`${modKey()}D`}>
          <CopyIcon /> Duplicate
        </MenuItem>
      ) : null}
      {!readOnly ? <MenuSeparator /> : null}
      {!hide.rename && onRename && !readOnly ? (
        <MenuItem onClick={onRename}>
          <PencilIcon /> Rename
        </MenuItem>
      ) : null}
      {!hide.addInside && !readOnly && node.kind !== 'file' ? (
        <MenuItem onClick={() => void actions.addInside(node)}>
          <PlusIcon /> Add page inside
        </MenuItem>
      ) : null}
      {!hide.addInside && !readOnly && node.kind !== 'file' ? (
        <MenuItem onClick={() => void actions.addInside(node, 'folder')}>
          <FolderPlusIcon /> Add folder inside
        </MenuItem>
      ) : null}
      {!hide.moveTo && !readOnly ? (
        <MenuItem onClick={() => actions.moveTo(node)} shortcut={`${modKey()}⇧P`}>
          <CornerUpRightIcon /> Move to…
        </MenuItem>
      ) : null}
      {!hide.archive && !readOnly ? (
        <MenuItem onClick={() => actions.toggleArchive(node)} data-testid="menu-archive">
          {node.archivedAt ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
          {node.archivedAt ? 'Unarchive' : 'Archive'}
        </MenuItem>
      ) : null}
      {!hide.delete && !readOnly ? (
        <>
          <MenuSeparator />
          <MenuItem
            variant="destructive"
            onClick={() => void actions.remove(node)}
            data-testid="menu-delete"
          >
            <Trash2Icon /> Delete
          </MenuItem>
        </>
      ) : null}
    </>
  );
}
