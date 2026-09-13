import type { CreateNodeRequest, Node, UpdateNodeRequest } from '@nook/api-client';
import { queryOptions, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api, keys } from '../../lib/api';

export function nodesQueryOptions(workspaceId: string, parentId?: string | null) {
  return queryOptions({
    queryKey: keys.nodes(workspaceId, parentId),
    queryFn: ({ signal }) => api.nodes.list(parentId ? { parentId } : {}, signal),
  });
}

export function nodeQueryOptions(id: string) {
  return queryOptions({
    queryKey: keys.node(id),
    queryFn: ({ signal }) => api.nodes.get(id, signal),
  });
}

/** Root → … → node, resolved through the node cache. */
export function ancestorsQueryOptions(qc: QueryClient, nodeId: string) {
  return queryOptions({
    queryKey: keys.ancestors(nodeId),
    queryFn: async () => {
      const chain: Node[] = [];
      const seen = new Set<string>();
      let id: string | null | undefined = nodeId;
      while (id && !seen.has(id)) {
        seen.add(id);
        const n: Node = await qc.fetchQuery(nodeQueryOptions(id));
        chain.unshift(n);
        id = n.parentId;
      }
      return chain;
    },
  });
}

export function useAncestors(nodeId: string | undefined) {
  const qc = useQueryClient();
  return useQuery({ ...ancestorsQueryOptions(qc, nodeId ?? ''), enabled: Boolean(nodeId) });
}

/** Every node currently in the cache for a workspace (for the palette). */
export function cachedNodes(qc: QueryClient, workspaceId: string): Node[] {
  const out = new Map<string, Node>();
  for (const [, data] of qc.getQueriesData<Node[]>({ queryKey: ['nodes', workspaceId] })) {
    for (const n of data ?? []) out.set(n.id, n);
  }
  for (const [, n] of qc.getQueriesData<Node>({ queryKey: ['node'] })) {
    if (n && n.workspaceId === workspaceId) out.set(n.id, n);
  }
  return [...out.values()].filter((n) => !n.deletedAt);
}

function touch(qc: QueryClient, workspaceId: string, node: Node, previousParent?: string | null) {
  qc.setQueryData(keys.node(node.id), node);
  void qc.invalidateQueries({ queryKey: keys.nodes(workspaceId, node.parentId) });
  if (previousParent !== undefined && previousParent !== node.parentId) {
    void qc.invalidateQueries({ queryKey: keys.nodes(workspaceId, previousParent) });
  }
  void qc.invalidateQueries({ queryKey: ['ancestors'] });
}

export function useCreateNode(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<CreateNodeRequest, 'kind'> & { kind?: 'page' }) =>
      api.nodes.create({ kind: 'page', ...body }),
    onSuccess: (node) => touch(qc, workspaceId, node),
  });
}

export function useUpdateNode(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateNodeRequest & { id: string }) => api.nodes.update(id, body),
    onMutate: async ({ id, ...body }) => {
      await qc.cancelQueries({ queryKey: keys.node(id) });
      const prev = qc.getQueryData<Node>(keys.node(id));
      if (prev) {
        qc.setQueryData<Node>(keys.node(id), {
          ...prev,
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.icon !== undefined ? { icon: body.icon } : {}),
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
    onError: (_e, vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(keys.node(vars.id), ctx.prev);
    },
    onSuccess: (node, _vars, ctx) => touch(qc, workspaceId, node, ctx?.prev?.parentId),
  });
}

export function useDeleteNode(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (node: Node) => api.nodes.remove(node.id),
    onSuccess: (_v, node) => {
      qc.removeQueries({ queryKey: keys.node(node.id) });
      void qc.invalidateQueries({ queryKey: keys.nodes(workspaceId, node.parentId) });
    },
  });
}
