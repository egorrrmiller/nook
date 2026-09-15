import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type {
  AddMemberRequest,
  ApiToken,
  AuthResponse,
  Attachment,
  Breadcrumb,
  ChangePasswordRequest,
  CreateApiTokenRequest,
  CreateInviteRequest,
  CreateNodeRequest,
  Favorite,
  InviteListItem,
  Node,
  QuickHit,
  Recent,
  TrashItem,
  UpdateMeRequest,
  UpdateNodeRequest,
  UpdateWorkspaceRequest,
  UserSettings,
  WorkspaceMember,
  WorkspaceSettings,
} from '@nook/api-client';
import { api } from './api';

export const queryKeys = {
  me: ['me'] as const,
  nodes: (workspaceId: string, parentId?: string | null, includeArchived = false) =>
    ['nodes', workspaceId, parentId ?? 'root', includeArchived ? 'all' : 'live'] as const,
  allNodes: (workspaceId: string) => ['nodes', workspaceId] as const,
  node: (workspaceId: string, id: string) => ['node', workspaceId, id] as const,
  ancestors: (workspaceId: string, id: string) => ['ancestors', workspaceId, id] as const,
  collabToken: (nodeId: string) => ['collab-token', nodeId] as const,
  favorites: (workspaceId: string) => ['favorites', workspaceId] as const,
  recents: (workspaceId: string) => ['recents', workspaceId] as const,
  trash: (workspaceId: string, q = '') => ['trash', workspaceId, q] as const,
  quickFind: (workspaceId: string, q: string) => ['quick-find', workspaceId, q] as const,
  meSettings: ['me-settings'] as const,
  workspaceSettings: (workspaceId: string) => ['workspace-settings', workspaceId] as const,
  members: (workspaceId: string) => ['members', workspaceId] as const,
  invites: ['invites'] as const,
  apiTokens: ['api-tokens'] as const,
  nodeFiles: (workspaceId: string, nodeId: string) => ['node-files', workspaceId, nodeId] as const,
};

// ---------------------------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------------------------

export const meQuery = () =>
  queryOptions<AuthResponse>({
    queryKey: queryKeys.me,
    queryFn: () => api.me(),
    staleTime: 5 * 60_000,
    retry: false,
  });

export const nodesQuery = (workspaceId: string, parentId?: string | null, includeArchived = false) =>
  queryOptions<Node[]>({
    queryKey: queryKeys.nodes(workspaceId, parentId, includeArchived),
    queryFn: () =>
      api.nodes.list({
        ...(parentId ? { parentId } : {}),
        ...(includeArchived ? { includeArchived: true } : {}),
      }),
    staleTime: 30_000,
  });

export const nodeQuery = (workspaceId: string, id: string) =>
  queryOptions<Node>({
    queryKey: queryKeys.node(workspaceId, id),
    queryFn: () => api.nodes.get(id),
    staleTime: 30_000,
  });

/** §7.1 server-side breadcrumb (root → … → parent). */
export const ancestorsQuery = (workspaceId: string, id: string) =>
  queryOptions<Breadcrumb>({
    queryKey: queryKeys.ancestors(workspaceId, id),
    queryFn: () => api.nodes.ancestors(id),
    staleTime: 30_000,
  });

export const favoritesQuery = (workspaceId: string) =>
  queryOptions<Favorite[]>({
    queryKey: queryKeys.favorites(workspaceId),
    queryFn: () => api.favorites.list(),
    staleTime: 30_000,
  });

export const recentsQuery = (workspaceId: string, limit = 20) =>
  queryOptions<Recent[]>({
    queryKey: queryKeys.recents(workspaceId),
    queryFn: () => api.recents.list(limit),
    staleTime: 10_000,
  });

export const trashQuery = (workspaceId: string, q = '') =>
  queryOptions<TrashItem[]>({
    queryKey: queryKeys.trash(workspaceId, q),
    queryFn: () => api.trash.list(q ? { q } : {}),
    staleTime: 10_000,
  });

export const quickFindQuery = (workspaceId: string, q: string, limit = 20) =>
  queryOptions<QuickHit[]>({
    queryKey: queryKeys.quickFind(workspaceId, q),
    queryFn: ({ signal }) => api.search.quick({ q: q || undefined, limit }, signal),
    staleTime: 10_000,
    placeholderData: (prev) => prev,
  });

export const meSettingsQuery = () =>
  queryOptions<UserSettings>({
    queryKey: queryKeys.meSettings,
    queryFn: () => api.me.settings.get(),
    staleTime: 60_000,
  });

export const workspaceSettingsQuery = (workspaceId: string) =>
  queryOptions<WorkspaceSettings>({
    queryKey: queryKeys.workspaceSettings(workspaceId),
    queryFn: () => api.workspaces.settings.get(workspaceId),
    staleTime: 60_000,
  });

export const membersQuery = (workspaceId: string) =>
  queryOptions<WorkspaceMember[]>({
    queryKey: queryKeys.members(workspaceId),
    queryFn: () => api.workspaces.members(workspaceId),
  });

export const invitesQuery = () =>
  queryOptions<InviteListItem[]>({ queryKey: queryKeys.invites, queryFn: () => api.invites.list() });

export const apiTokensQuery = () =>
  queryOptions<ApiToken[]>({ queryKey: queryKeys.apiTokens, queryFn: () => api.apiTokens.list() });

export function useMe() {
  return useQuery(meQuery());
}
export function useNodes(workspaceId: string, parentId?: string | null, enabled = true, includeArchived = false) {
  return useQuery({ ...nodesQuery(workspaceId, parentId, includeArchived), enabled });
}
export function useNode(workspaceId: string, id: string, enabled = true) {
  return useQuery({ ...nodeQuery(workspaceId, id), enabled });
}
export function useNodeFiles(workspaceId: string, nodeId: string, enabled = true) {
  return useQuery<Attachment[]>({
    queryKey: queryKeys.nodeFiles(workspaceId, nodeId),
    queryFn: ({ signal }) => api.nodes.files(nodeId, signal),
    enabled,
    staleTime: 30_000,
  });
}
export function useAncestors(workspaceId: string, id: string | null) {
  return useQuery({ ...ancestorsQuery(workspaceId, id ?? ''), enabled: !!id });
}
export function useFavorites(workspaceId: string) {
  return useQuery(favoritesQuery(workspaceId));
}
export function useRecents(workspaceId: string, enabled = true) {
  return useQuery({ ...recentsQuery(workspaceId), enabled });
}
export function useTrash(workspaceId: string, q = '') {
  return useQuery(trashQuery(workspaceId, q));
}
export function useQuickFind(workspaceId: string, q: string, enabled = true) {
  return useQuery({ ...quickFindQuery(workspaceId, q), enabled });
}
export function useMeSettings() {
  return useQuery(meSettingsQuery());
}
export function useWorkspaceSettings(workspaceId: string) {
  return useQuery(workspaceSettingsQuery(workspaceId));
}
export function useMembers(workspaceId: string) {
  return useQuery(membersQuery(workspaceId));
}
export function useInvites() {
  return useQuery(invitesQuery());
}
export function useApiTokens() {
  return useQuery(apiTokensQuery());
}

export function useRemoveFile(workspaceId: string, nodeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (attachmentId: string) => api.files.remove(attachmentId),
    onSuccess: (_void, attachmentId) => {
      qc.setQueryData<Attachment[]>(queryKeys.nodeFiles(workspaceId, nodeId), (files) =>
        files?.filter((file) => file.id !== attachmentId),
      );
    },
  });
}

// ---------------------------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------------------------

export function invalidateNodeLists(qc: QueryClient, workspaceId: string) {
  return qc.invalidateQueries({ queryKey: queryKeys.allNodes(workspaceId) });
}

/** Everything that mirrors a node somewhere else (favorites, recents, breadcrumbs, quick find). */
export function invalidateNodeMirrors(qc: QueryClient, workspaceId: string) {
  void qc.invalidateQueries({ queryKey: queryKeys.favorites(workspaceId) });
  void qc.invalidateQueries({ queryKey: queryKeys.recents(workspaceId) });
  void qc.invalidateQueries({ queryKey: ['ancestors', workspaceId] });
  void qc.invalidateQueries({ queryKey: ['quick-find', workspaceId] });
}

/** Writes `node` into its detail cache and patches it in place in every list that holds it. */
export function patchNodeEverywhere(qc: QueryClient, workspaceId: string, node: Node) {
  qc.setQueryData(queryKeys.node(workspaceId, node.id), node);
  qc.setQueriesData<Node[]>({ queryKey: queryKeys.allNodes(workspaceId) }, (list) =>
    list?.map((n) => (n.id === node.id ? node : n)),
  );
  qc.setQueriesData<Favorite[]>({ queryKey: queryKeys.favorites(workspaceId) }, (list) =>
    list?.map((f) => (f.nodeId === node.id ? { ...f, node } : f)),
  );
  qc.setQueriesData<Recent[]>({ queryKey: queryKeys.recents(workspaceId) }, (list) =>
    list?.map((r) => (r.node.id === node.id ? { ...r, node } : r)),
  );
}

function markHasChildren(qc: QueryClient, workspaceId: string, parentId: string | null | undefined, value: boolean) {
  if (!parentId) return;
  const patch = (n: Node): Node => (n.id === parentId && n.hasChildren !== value ? { ...n, hasChildren: value } : n);
  const detail = qc.getQueryData<Node>(queryKeys.node(workspaceId, parentId));
  if (detail) qc.setQueryData(queryKeys.node(workspaceId, parentId), patch(detail));
  qc.setQueriesData<Node[]>({ queryKey: queryKeys.allNodes(workspaceId) }, (list) => list?.map(patch));
  qc.setQueriesData<Favorite[]>({ queryKey: queryKeys.favorites(workspaceId) }, (list) =>
    list?.map((f) => (f.nodeId === parentId ? { ...f, node: patch(f.node) } : f)),
  );
}

// ---------------------------------------------------------------------------------------------
// Node mutations
// ---------------------------------------------------------------------------------------------

export function useCreateNode(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateNodeRequest) => api.nodes.create(body),
    onSuccess: (node) => {
      qc.setQueryData(queryKeys.node(workspaceId, node.id), node);
      markHasChildren(qc, workspaceId, node.parentId, true);
      void invalidateNodeLists(qc, workspaceId);
      void qc.invalidateQueries({ queryKey: ['quick-find', workspaceId] });
    },
  });
}

export function useUpdateNode(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateNodeRequest & { id: string }) => api.nodes.update(id, body),
    onMutate: async ({ id, ...body }) => {
      await qc.cancelQueries({ queryKey: queryKeys.node(workspaceId, id) });
      const prev = qc.getQueryData<Node>(queryKeys.node(workspaceId, id));
      if (prev && (body.title !== undefined || body.icon !== undefined || body.cover !== undefined || body.pageSettings)) {
        patchNodeEverywhere(qc, workspaceId, {
          ...prev,
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.icon !== undefined ? { icon: body.icon } : {}),
          ...(body.cover !== undefined ? { cover: body.cover } : {}),
          ...(body.pageSettings
            ? {
                pageSettings: {
                  font: 'default',
                  smallText: false,
                  fullWidth: false,
                  locked: false,
                  ...prev.pageSettings,
                  ...body.pageSettings,
                },
              }
            : {}),
        });
      }
      return { prev };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.prev) patchNodeEverywhere(qc, workspaceId, ctx.prev);
    },
    onSuccess: (node, vars, ctx) => {
      patchNodeEverywhere(qc, workspaceId, node);
      if (vars.parentId !== undefined && ctx?.prev && ctx.prev.parentId !== node.parentId) {
        markHasChildren(qc, workspaceId, node.parentId, true);
      }
      void invalidateNodeLists(qc, workspaceId);
      invalidateNodeMirrors(qc, workspaceId);
    },
  });
}

/** Move a node (`parentId` + fractional `position`) with an optimistic list update. */
export function useMoveNode(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, parentId, position }: { id: string; parentId: string | null; position?: string }) =>
      api.nodes.update(id, position ? { parentId, position } : { parentId }),
    onMutate: async ({ id, parentId, position }) => {
      await qc.cancelQueries({ queryKey: queryKeys.allNodes(workspaceId) });
      const snapshot = qc.getQueriesData<Node[]>({ queryKey: queryKeys.allNodes(workspaceId) });
      let moved: Node | undefined;
      for (const [, list] of snapshot) moved ??= list?.find((n) => n.id === id);
      const oldParent = moved?.parentId ?? null;
      if (moved) {
        const next: Node = { ...moved, parentId, position: position ?? moved.position };
        // Remove from every list, add to the target list(s), keep lists sorted by position.
        qc.setQueriesData<Node[]>({ queryKey: queryKeys.allNodes(workspaceId) }, (list) =>
          list?.filter((n) => n.id !== id),
        );
        for (const [key] of snapshot) {
          const keyParent = key[2] === 'root' ? null : (key[2] as string);
          if (keyParent === parentId) {
            qc.setQueryData<Node[]>(key, (list) =>
              [...(list ?? []), next].sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0)),
            );
          }
        }
        qc.setQueryData(queryKeys.node(workspaceId, id), next);
        markHasChildren(qc, workspaceId, parentId, true);
        const oldSiblings = qc
          .getQueriesData<Node[]>({ queryKey: queryKeys.allNodes(workspaceId) })
          .some(([key, list]) => (key[2] === 'root' ? null : key[2]) === oldParent && (list?.length ?? 0) > 0);
        if (oldParent && oldParent !== parentId && !oldSiblings) markHasChildren(qc, workspaceId, oldParent, false);
      }
      return { snapshot };
    },
    onError: (_e, _v, ctx) => {
      for (const [key, data] of ctx?.snapshot ?? []) qc.setQueryData(key, data);
    },
    onSettled: (node) => {
      if (node) patchNodeEverywhere(qc, workspaceId, node);
      void invalidateNodeLists(qc, workspaceId);
      invalidateNodeMirrors(qc, workspaceId);
    },
  });
}

export function useDeleteNode(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.nodes.remove(id),
    onSuccess: (_void, id) => {
      const prev = qc.getQueryData<Node>(queryKeys.node(workspaceId, id));
      qc.removeQueries({ queryKey: queryKeys.node(workspaceId, id) });
      qc.setQueriesData<Node[]>({ queryKey: queryKeys.allNodes(workspaceId) }, (list) =>
        list?.filter((n) => n.id !== id),
      );
      if (prev?.parentId) {
        const siblingsLeft = qc
          .getQueriesData<Node[]>({ queryKey: queryKeys.allNodes(workspaceId) })
          .some(([key, list]) => key[2] === prev.parentId && (list?.length ?? 0) > 0);
        if (!siblingsLeft) markHasChildren(qc, workspaceId, prev.parentId, false);
      }
      void invalidateNodeLists(qc, workspaceId);
      invalidateNodeMirrors(qc, workspaceId);
      void qc.invalidateQueries({ queryKey: ['trash', workspaceId] });
    },
  });
}

export function useDuplicateNode(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, position }: { id: string; position?: string }) =>
      api.nodes.duplicate(id, position ? { position } : {}),
    onSuccess: (node) => {
      qc.setQueryData(queryKeys.node(workspaceId, node.id), node);
      void invalidateNodeLists(qc, workspaceId);
      void qc.invalidateQueries({ queryKey: ['quick-find', workspaceId] });
    },
  });
}

export function useArchiveNode(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      archived ? api.nodes.archive(id) : api.nodes.unarchive(id),
    onSuccess: (node) => {
      patchNodeEverywhere(qc, workspaceId, node);
      void invalidateNodeLists(qc, workspaceId);
      invalidateNodeMirrors(qc, workspaceId);
    },
  });
}

// ---------------------------------------------------------------------------------------------
// Favorites, recents, trash
// ---------------------------------------------------------------------------------------------

export function useSetFavorite(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ node, favorite, position }: { node: Node; favorite: boolean; position?: string }) => {
      if (favorite) return api.favorites.add(node.id, position ? { position } : {});
      await api.favorites.remove(node.id);
      return null;
    },
    onMutate: async ({ node, favorite, position }) => {
      await qc.cancelQueries({ queryKey: queryKeys.favorites(workspaceId) });
      const prev = qc.getQueryData<Favorite[]>(queryKeys.favorites(workspaceId));
      qc.setQueryData<Favorite[]>(queryKeys.favorites(workspaceId), (list = []) => {
        const without = list.filter((f) => f.nodeId !== node.id);
        if (!favorite) return without;
        const pos = position ?? (list.length ? (list[list.length - 1]!.position ?? 'a0') + 'V' : 'a0');
        return [...without, { nodeId: node.id, position: pos, node }].sort((a, b) =>
          a.position < b.position ? -1 : 1,
        );
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKeys.favorites(workspaceId), ctx.prev);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: queryKeys.favorites(workspaceId) }),
  });
}

/** Reorders a favourite: `PUT /api/favorites/{id} {position}` (idempotent upsert). */
export function useReorderFavorite(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ nodeId, position }: { nodeId: string; position: string }) =>
      api.favorites.add(nodeId, { position }),
    onMutate: async ({ nodeId, position }) => {
      await qc.cancelQueries({ queryKey: queryKeys.favorites(workspaceId) });
      const prev = qc.getQueryData<Favorite[]>(queryKeys.favorites(workspaceId));
      qc.setQueryData<Favorite[]>(queryKeys.favorites(workspaceId), (list = []) =>
        list.map((f) => (f.nodeId === nodeId ? { ...f, position } : f)).sort((a, b) => (a.position < b.position ? -1 : 1)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKeys.favorites(workspaceId), ctx.prev);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: queryKeys.favorites(workspaceId) }),
  });
}

export function useRestoreTrash(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, parentId }: { id: string; parentId?: string | null }) =>
      api.trash.restore(id, parentId !== undefined ? { parentId } : {}),
    onSuccess: (node) => {
      qc.setQueryData(queryKeys.node(workspaceId, node.id), node);
      markHasChildren(qc, workspaceId, node.parentId, true);
      void qc.invalidateQueries({ queryKey: ['trash', workspaceId] });
      void invalidateNodeLists(qc, workspaceId);
      invalidateNodeMirrors(qc, workspaceId);
    },
  });
}

export function usePurgeTrash(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.trash.purge(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['trash', workspaceId] }),
  });
}

export function useEmptyTrash(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.trash.empty(),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['trash', workspaceId] }),
  });
}

// ---------------------------------------------------------------------------------------------
// Account, settings, workspace admin
// ---------------------------------------------------------------------------------------------

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateMeRequest) => api.me.update(body),
    onSuccess: (user) => {
      qc.setQueryData<AuthResponse>(queryKeys.me, (prev) => (prev ? { ...prev, user } : prev));
    },
  });
}

export function useChangePassword() {
  return useMutation({ mutationFn: (body: ChangePasswordRequest) => api.me.changePassword(body) });
}

export function useSetMeSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) => api.me.settings.set(key, value),
    onMutate: ({ key, value }) => {
      qc.setQueryData<UserSettings>(queryKeys.meSettings, (prev) => ({ ...(prev ?? {}), [key]: value }));
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: queryKeys.meSettings }),
  });
}

export function useUpdateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateWorkspaceRequest & { id: string }) => api.workspaces.update(id, body),
    onSuccess: (ws) => {
      qc.setQueryData<AuthResponse>(queryKeys.me, (prev) =>
        prev ? { ...prev, workspaces: prev.workspaces.map((w) => (w.id === ws.id ? ws : w)) } : prev,
      );
      void qc.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}

export function useDeleteWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.workspaces.remove(id),
    onSuccess: (_v, id) => {
      qc.setQueryData<AuthResponse>(queryKeys.me, (prev) =>
        prev ? { ...prev, workspaces: prev.workspaces.filter((w) => w.id !== id) } : prev,
      );
      void qc.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}

export function useSetWorkspaceSetting(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) => api.workspaces.settings.set(workspaceId, key, value),
    onMutate: ({ key, value }) => {
      qc.setQueryData<WorkspaceSettings>(queryKeys.workspaceSettings(workspaceId), (prev) => ({ ...(prev ?? {}), [key]: value }));
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: queryKeys.workspaceSettings(workspaceId) }),
  });
}

export function useAddMember(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AddMemberRequest) => api.workspaces.addMember(workspaceId, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.members(workspaceId) }),
  });
}

export function useRemoveMember(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.workspaces.removeMember(workspaceId, userId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.members(workspaceId) }),
  });
}

export function useCreateInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateInviteRequest) => api.invites.create(body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.invites }),
  });
}

export function useRevokeInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => api.invites.remove(code),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.invites }),
  });
}

export function useCreateApiToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateApiTokenRequest) => api.apiTokens.create(body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.apiTokens }),
  });
}

export function useDeleteApiToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.apiTokens.remove(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.apiTokens }),
  });
}
