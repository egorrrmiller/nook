import { useEffect } from 'react';
import { useRealtime } from '../../../app/realtime';

/**
 * Subscribes to a §9.9 hub message (`linksChanged`, `tagsChanged`, `historyChanged`) for one node.
 * `RealtimeClient.on` is typed for the §5 events only, so we go through the underlying
 * SignalR connection (read-only use of the shell's client). In mock mode there is no client;
 * callers fall back to `refetchOnWindowFocus` + a 30 s interval (see queries.ts).
 */
export function useKnowledgeEvent(
  event: 'linksChanged' | 'tagsChanged' | 'historyChanged',
  nodeId: string | null,
  onChange: () => void,
): boolean {
  const client = useRealtime();
  useEffect(() => {
    if (!client || !nodeId) return;
    const handler = (payload: { nodeId: string }) => {
      if (payload?.nodeId === nodeId) onChange();
    };
    client.connection.on(event, handler);
    return () => client.connection.off(event, handler);
  }, [client, event, nodeId, onChange]);
  return client !== null;
}

/** True when a live hub connection exists (so polling fallbacks can be disabled). */
export function useHasRealtime(): boolean {
  return useRealtime() !== null;
}
