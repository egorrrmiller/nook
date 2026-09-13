import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Node } from '@nook/api-client';
import { createRealtimeClient, type RealtimeClient } from '../lib/signalr';
import { queryKeys } from '../lib/queries';
import { IS_MOCK } from '../lib/api';

const RealtimeContext = createContext<RealtimeClient | null>(null);

/**
 * Owns the SignalR connection for the signed-in session and keeps the query cache in sync
 * with `nodeChanged` / `nodeDeleted` / `nodeMoved` (contracts §5). No-op in mock mode.
 */
export function RealtimeProvider({
  children,
  workspaceId,
}: {
  children: ReactNode;
  workspaceId: string;
}) {
  const qc = useQueryClient();
  const client = useMemo(() => (IS_MOCK ? null : createRealtimeClient('/hub')), []);

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    const offs = [
      client.on('nodeChanged', ({ node }: { node: Node }) => {
        qc.setQueryData(queryKeys.node(node.workspaceId, node.id), node);
        void qc.invalidateQueries({ queryKey: queryKeys.nodes(node.workspaceId, node.parentId) });
      }),
      client.on('nodeDeleted', () => {
        void qc.invalidateQueries({ queryKey: queryKeys.allNodes(workspaceId) });
      }),
      client.on('nodeMoved', () => {
        void qc.invalidateQueries({ queryKey: queryKeys.allNodes(workspaceId) });
      }),
    ];
    client
      .start()
      .then(() => {
        if (!cancelled) return client.watchWorkspace(workspaceId);
      })
      .catch((err) => console.warn('[realtime] connection failed', err));
    return () => {
      cancelled = true;
      offs.forEach((off) => off());
      void client.stop();
    };
  }, [client, qc, workspaceId]);

  return <RealtimeContext.Provider value={client}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeClient | null {
  return useContext(RealtimeContext);
}

/** Announces presence on a node for the lifetime of the component. */
export function useEnterNode(nodeId: string | null) {
  const client = useRealtime();
  useEffect(() => {
    if (!client || !nodeId) return;
    void client.enterNode(nodeId);
    return () => void client.leaveNode(nodeId);
  }, [client, nodeId]);
}
