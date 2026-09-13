import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { Node } from '@nook/api-client';
import { nodeQuery } from './queries';

/** Walks parentId links up to the root using the node cache. */
export async function fetchAncestors(
  qc: QueryClient,
  workspaceId: string,
  nodeId: string,
): Promise<Node[]> {
  const chain: Node[] = [];
  let id: string | null | undefined = nodeId;
  const guard = new Set<string>();
  while (id && !guard.has(id)) {
    guard.add(id);
    const node: Node = await qc.fetchQuery(nodeQuery(workspaceId, id));
    chain.unshift(node);
    id = node.parentId;
  }
  return chain;
}

export function useAncestors(workspaceId: string, nodeId: string | null) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ['ancestors', workspaceId, nodeId],
    queryFn: () => fetchAncestors(qc, workspaceId, nodeId!),
    enabled: !!nodeId,
    staleTime: 10_000,
  });
}
