import { useEffect, useState, type DependencyList } from 'react';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Minimal async-data hook. The editor package deliberately does not depend on react-query (the
 * host app owns that); the few fetches inside blocks are simple enough for this.
 */
export function useQueryless<T>(load: () => Promise<T>, deps: DependencyList): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null });
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    load()
      .then((data) => live && setState({ data, loading: false, error: null }))
      .catch((e: unknown) => live && setState({ data: null, loading: false, error: e instanceof Error ? e.message : String(e) }));
    return () => {
      live = false;
    };
    // The caller controls invalidation through `deps`, like useEffect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
