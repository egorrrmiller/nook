import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type { AuthResponse, CreateNodeRequest, Node, UpdateNodeRequest } from '@nook/api-client';
import { api } from './api';

export const queryKeys = {
  me: ['me'] as const,
  nodes: (workspaceId: string, parentId?: string | null) =>
    ['nodes', workspaceId, parentId ?? 'root'] as const,
  allNodes: (workspaceId: string) => ['nodes', workspaceId] as const,
  node: (workspaceId: string, id: string) => ['node', workspaceId, id] as const,
  collabToken: (nodeId: string) => ['collab-token', nodeId] as const,
};

export const meQuery = () =>
  queryOptions<AuthResponse>({
    queryKey: queryKeys.me,
    queryFn: () => api.me(),
    staleTime: 5 * 60_000,
    retry: false,
  });

export const nodesQuery = (workspaceId: string, parentId?: string | null) =>
  queryOptions<Node[]>({
    queryKey: queryKeys.nodes(workspaceId, parentId),
    queryFn: () => api.nodes.list(parentId ? { parentId } : {}),
    staleTime: 30_000,
  });

export const nodeQuery = (workspaceId: string, id: string) =>
  queryOptions<Node>({
    queryKey: queryKeys.node(workspaceId, id),
    queryFn: () => api.nodes.get(id),
    staleTime: 30_000,
  });

export function useMe() {
  return useQuery(meQuery());
}

export function useNodes(workspaceId: string, parentId?: string | null, enabled = true) {
  return useQuery({ ...nodesQuery(workspaceId, parentId), enabled });
}

export function useNode(workspaceId: string, id: string) {
  return useQuery(nodeQuery(workspaceId, id));
}

export function invalidateNodeLists(qc: QueryClient, workspaceId: string) {
  return qc.invalidateQueries({ queryKey: queryKeys.allNodes(workspaceId) });
}

export function useCreateNode(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateNodeRequest) => api.nodes.create(body),
    onSuccess: (node) => {
      qc.setQueryData(queryKeys.node(workspaceId, node.id), node);
      void invalidateNodeLists(qc, workspaceId);
    },
  });
}

export function useUpdateNode(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateNodeRequest & { id: string }) => api.nodes.update(id, body),
    onSuccess: (node) => {
      qc.setQueryData(queryKeys.node(workspaceId, node.id), node);
      // Patch the node in place in whichever list holds it, then refetch in background.
      qc.setQueriesData<Node[]>({ queryKey: queryKeys.allNodes(workspaceId) }, (list) =>
        list?.map((n) => (n.id === node.id ? node : n)),
      );
      void invalidateNodeLists(qc, workspaceId);
    },
  });
}

export function useDeleteNode(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.nodes.remove(id),
    onSuccess: (_void, id) => {
      qc.removeQueries({ queryKey: queryKeys.node(workspaceId, id) });
      void invalidateNodeLists(qc, workspaceId);
    },
  });
}

/** Fetches every reachable node breadth-first — used by the palette until server search lands (wave 1). */
export async function fetchAllNodes(qc: QueryClient, workspaceId: string): Promise<Node[]> {
  const out: Node[] = [];
  const queue: (string | null)[] = [null];
  const seen = new Set<string>();
  while (queue.length) {
    const parentId = queue.shift() ?? null;
    const children = await qc.fetchQuery(nodesQuery(workspaceId, parentId));
    for (const n of children) {
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      out.push(n);
      queue.push(n.id);
    }
  }
  return out;
}
