import { useEffect, useState } from 'react';
import type { ApiClient, Node } from '@nook/api-client';

/**
 * Tiny per-session cache for node metadata used by mentions, page links and embeds. The editor
 * package does not depend on react-query; the host app keeps its own cache and both are cheap.
 */
const cache = new Map<string, Node>();
const inflight = new Map<string, Promise<Node>>();
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

export function primeNodeInfo(node: Node): void {
  cache.set(node.id, node);
  notify();
}

export function invalidateNodeInfo(id?: string): void {
  if (id) cache.delete(id);
  else cache.clear();
  notify();
}

export function fetchNodeInfo(api: ApiClient, id: string): Promise<Node> {
  const hit = cache.get(id);
  if (hit) return Promise.resolve(hit);
  const pending = inflight.get(id);
  if (pending) return pending;
  const p = api.nodes
    .get(id)
    .then((n) => {
      cache.set(id, n);
      notify();
      return n;
    })
    .finally(() => inflight.delete(id));
  inflight.set(id, p);
  return p;
}

export interface NodeInfoState {
  node: Node | null;
  loading: boolean;
  error: string | null;
}

export function useNodeInfo(api: ApiClient, id: string | null | undefined): NodeInfoState {
  const [state, setState] = useState<NodeInfoState>(() => ({
    node: (id && cache.get(id)) || null,
    loading: !!id && !cache.has(id),
    error: null,
  }));

  useEffect(() => {
    if (!id) {
      setState({ node: null, loading: false, error: null });
      return;
    }
    let live = true;
    const sync = () => {
      const n = cache.get(id);
      if (n && live) setState({ node: n, loading: false, error: null });
    };
    listeners.add(sync);
    sync();
    if (!cache.has(id)) {
      setState((s) => ({ ...s, loading: true }));
      fetchNodeInfo(api, id).catch((e: unknown) => {
        if (live) setState({ node: null, loading: false, error: e instanceof Error ? e.message : 'Not found' });
      });
    }
    return () => {
      live = false;
      listeners.delete(sync);
    };
  }, [api, id]);

  return state;
}

export function nodeTitle(node: { title?: string | null } | null | undefined): string {
  const t = node?.title?.trim();
  return t ? t : 'Untitled';
}
