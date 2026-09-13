import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type {
  Backlink,
  BrokenLink,
  CreateTagRequest,
  GraphQuery,
  GraphResponse,
  NodeTag,
  OutgoingLink,
  PageProperties,
  PatchPagePropertiesRequest,
  SearchRequest,
  SearchResponse,
  SetNodeTagsRequest,
  Tag,
} from '@nook/api-client';
import { ApiError } from '@nook/api-client';
import { api } from '../../../lib/api';
import { queryKeys } from '../../../lib/queries';
import { knowledgeKeys as k } from './keys';
import { useHasRealtime } from './realtime';

/** Polling fallback for §9.9 events when there is no hub (mock mode / hub down). */
function liveFallback(hasRealtime: boolean) {
  return hasRealtime
    ? {}
    : ({ refetchOnWindowFocus: true, refetchInterval: 30_000, refetchIntervalInBackground: false } as const);
}

// ---------------------------------------------------------------------------------------------
// §9.1 links
// ---------------------------------------------------------------------------------------------

export function useBacklinks(workspaceId: string, nodeId: string) {
  const live = useHasRealtime();
  return useQuery<Backlink[]>({
    queryKey: k.backlinks(workspaceId, nodeId),
    queryFn: ({ signal }) => api.nodes.backlinks(nodeId, signal),
    staleTime: 15_000,
    ...liveFallback(live),
  });
}

export function useOutgoingLinks(workspaceId: string, nodeId: string) {
  const live = useHasRealtime();
  return useQuery<OutgoingLink[]>({
    queryKey: k.links(workspaceId, nodeId),
    queryFn: ({ signal }) => api.nodes.links(nodeId, signal),
    staleTime: 15_000,
    ...liveFallback(live),
  });
}

export function useBrokenLinks(workspaceId: string, limit = 200) {
  return useQuery<BrokenLink[]>({
    queryKey: [...k.broken(workspaceId), limit],
    queryFn: ({ signal }) => api.links.broken(limit, signal),
    staleTime: 30_000,
  });
}

export function invalidateLinks(qc: QueryClient, workspaceId: string, nodeId: string) {
  void qc.invalidateQueries({ queryKey: k.backlinks(workspaceId, nodeId) });
  void qc.invalidateQueries({ queryKey: k.links(workspaceId, nodeId) });
  void qc.invalidateQueries({ queryKey: k.broken(workspaceId) });
}

// ---------------------------------------------------------------------------------------------
// §9.2 tags
// ---------------------------------------------------------------------------------------------

export function useTags(workspaceId: string, enabled = true) {
  return useQuery<Tag[]>({
    queryKey: k.tags(workspaceId),
    queryFn: ({ signal }) => api.tags.list(signal),
    staleTime: 60_000,
    enabled,
  });
}

export function useNodeTags(workspaceId: string, nodeId: string, enabled = true) {
  const live = useHasRealtime();
  return useQuery<NodeTag[]>({
    queryKey: k.nodeTags(workspaceId, nodeId),
    queryFn: ({ signal }) => api.nodes.tags(nodeId, signal),
    staleTime: 60_000,
    enabled,
    ...liveFallback(live),
  });
}

export function useSetNodeTags(workspaceId: string, nodeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SetNodeTagsRequest) => api.nodes.setTags(nodeId, body),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: k.nodeTags(workspaceId, nodeId) });
      const prev = qc.getQueryData<NodeTag[]>(k.nodeTags(workspaceId, nodeId));
      const all = qc.getQueryData<Tag[]>(k.tags(workspaceId)) ?? [];
      // Optimistic: keep inline tags, rebuild the manual set from ids + names.
      const inline = (prev ?? []).filter((t) => t.source === 'inline');
      const manual: NodeTag[] = [];
      for (const id of body.tagIds ?? []) {
        const t = all.find((x) => x.id === id) ?? prev?.find((x) => x.id === id);
        if (t) manual.push({ ...t, source: 'manual' });
      }
      for (const name of body.names ?? []) {
        const t = all.find((x) => x.name.toLowerCase() === name.toLowerCase());
        manual.push(t ? { ...t, source: 'manual' } : { id: `tmp-${name}`, name, color: null, source: 'manual' });
      }
      qc.setQueryData<NodeTag[]>(k.nodeTags(workspaceId, nodeId), [...manual, ...inline.filter((i) => !manual.some((m) => m.id === i.id))]);
      return { prev };
    },
    onError: (_e, _b, ctx) => {
      if (ctx?.prev) qc.setQueryData(k.nodeTags(workspaceId, nodeId), ctx.prev);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: k.nodeTags(workspaceId, nodeId) });
      void qc.invalidateQueries({ queryKey: k.tags(workspaceId) });
    },
  });
}

export function useCreateTag(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTagRequest) => api.tags.create(body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: k.tags(workspaceId) }),
  });
}

export function useUpdateTag(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; color?: string | null }) => api.tags.update(id, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: k.tags(workspaceId) });
      void qc.invalidateQueries({ queryKey: [...k.all(workspaceId), 'node-tags'] });
    },
  });
}

// ---------------------------------------------------------------------------------------------
// §9.3 properties
// ---------------------------------------------------------------------------------------------

export function useProperties(workspaceId: string, nodeId: string) {
  return useQuery<PageProperties>({
    queryKey: k.properties(workspaceId, nodeId),
    queryFn: ({ signal }) => api.nodes.properties(nodeId, signal),
    staleTime: 30_000,
  });
}

/** Optimistic merge; `null` removes a property (contracts §9.3). */
export function usePatchProperties(workspaceId: string, nodeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: PatchPagePropertiesRequest) => api.nodes.patchProperties(nodeId, patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: k.properties(workspaceId, nodeId) });
      const prev = qc.getQueryData<PageProperties>(k.properties(workspaceId, nodeId));
      qc.setQueryData<PageProperties>(k.properties(workspaceId, nodeId), (cur) => applyPatch(cur ?? {}, patch));
      return { prev };
    },
    onError: (_e, _p, ctx) => {
      if (ctx?.prev) qc.setQueryData(k.properties(workspaceId, nodeId), ctx.prev);
    },
    onSuccess: (data) => {
      qc.setQueryData(k.properties(workspaceId, nodeId), data);
      // Node carries `properties` too (§9.3) — keep the shell's cache coherent.
      qc.setQueryData(queryKeys.node(workspaceId, nodeId), (n: { properties?: PageProperties | null } | undefined) =>
        n ? { ...n, properties: data } : n,
      );
    },
  });
}

export function applyPatch(cur: PageProperties, patch: PatchPagePropertiesRequest): PageProperties {
  const next: PageProperties = { ...cur };
  for (const [name, prop] of Object.entries(patch)) {
    if (prop === null || prop === undefined) delete next[name];
    else next[name] = prop;
  }
  return next;
}

/** Replace (used for rename / reorder, which PATCH cannot express atomically). */
export function useSetProperties(workspaceId: string, nodeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PageProperties) => api.nodes.setProperties(nodeId, body),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: k.properties(workspaceId, nodeId) });
      const prev = qc.getQueryData<PageProperties>(k.properties(workspaceId, nodeId));
      qc.setQueryData<PageProperties>(k.properties(workspaceId, nodeId), body);
      return { prev };
    },
    onError: (_e, _p, ctx) => {
      if (ctx?.prev) qc.setQueryData(k.properties(workspaceId, nodeId), ctx.prev);
    },
    onSuccess: (data) => qc.setQueryData(k.properties(workspaceId, nodeId), data),
  });
}

// ---------------------------------------------------------------------------------------------
// §9.4 aliases
// ---------------------------------------------------------------------------------------------

export function useAliases(workspaceId: string, nodeId: string) {
  return useQuery<string[]>({
    queryKey: k.aliases(workspaceId, nodeId),
    queryFn: ({ signal }) => api.nodes.aliases(nodeId, signal),
    staleTime: 30_000,
  });
}

/** Parsed from the 409 body of `PUT /aliases` ("lists the conflicting node"). */
export interface AliasConflict {
  alias: string;
  node: { id: string; title: string; icon?: { type: string; value: string } | null } | null;
}

export function parseAliasConflict(err: unknown): AliasConflict | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  const b = (err.body ?? {}) as Record<string, unknown>;
  const list = Array.isArray(b.conflicts) ? (b.conflicts as Record<string, unknown>[]) : null;
  const first = list?.[0] ?? b;
  const node = (first.node ?? first.conflictingNode ?? b.node ?? b.conflictingNode ?? null) as AliasConflict['node'];
  const alias = String(first.alias ?? b.alias ?? '');
  return { alias, node: node && typeof node === 'object' && 'id' in node ? node : null };
}

export function useSetAliases(workspaceId: string, nodeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (aliases: string[]) => api.nodes.setAliases(nodeId, aliases),
    onSuccess: (data) => qc.setQueryData(k.aliases(workspaceId, nodeId), data),
  });
}

// ---------------------------------------------------------------------------------------------
// §9.5 search
// ---------------------------------------------------------------------------------------------

export function useSearch(workspaceId: string, body: Omit<SearchRequest, 'cursor'>, enabled: boolean) {
  return useInfiniteQuery<SearchResponse, Error, { pages: SearchResponse[]; pageParams: unknown[] }, readonly unknown[], string | undefined>({
    queryKey: k.search(workspaceId, body),
    queryFn: ({ pageParam, signal }) => api.search.full({ ...body, cursor: pageParam }, signal),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
    staleTime: 10_000,
    placeholderData: (prev) => prev,
  });
}

// ---------------------------------------------------------------------------------------------
// §9.6 graph
// ---------------------------------------------------------------------------------------------

export function useGraph(workspaceId: string, query: GraphQuery) {
  return useQuery<GraphResponse>({
    queryKey: k.graph(workspaceId, query),
    queryFn: ({ signal }) => api.graph.get(query, signal),
    staleTime: 30_000,
  });
}
