import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Node } from '@nook/api-client';
import { createRealtimeClient, type HubEventName, type HubEvents, type RealtimeClient } from '../lib/signalr';
import {
  invalidateNodeLists,
  invalidateNodeMirrors,
  patchNodeEverywhere,
  queryKeys,
} from '../lib/queries';
import { IS_MOCK } from '../lib/api';
import { usePresenceStore } from '../stores/presence';

const RealtimeContext = createContext<RealtimeClient | null>(null);

/**
 * Owns the SignalR connection for the signed-in session and keeps the query cache in sync with
 * contracts §5 (`nodeChanged`/`nodeDeleted`/`nodeMoved`/`presence`/`documentChanged`) and the §7.6
 * additions (`favoritesChanged`, `nodeArchived`, `nodeRestored`, `trashChanged`). No-op in mock mode.
 */
export function RealtimeProvider({ children, workspaceId }: { children: ReactNode; workspaceId: string }) {
  const qc = useQueryClient();
  const client = useMemo(() => (IS_MOCK ? null : createRealtimeClient('/hub')), []);

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    const offs = [
      client.on('nodeChanged', ({ node }: { node: Node }) => {
        patchNodeEverywhere(qc, node.workspaceId, node);
        void qc.invalidateQueries({ queryKey: queryKeys.nodes(node.workspaceId, node.parentId) });
        invalidateNodeMirrors(qc, node.workspaceId);
      }),
      client.on('nodeDeleted', ({ id }) => {
        qc.removeQueries({ queryKey: queryKeys.node(workspaceId, id) });
        void invalidateNodeLists(qc, workspaceId);
        invalidateNodeMirrors(qc, workspaceId);
        void qc.invalidateQueries({ queryKey: ['trash', workspaceId] });
      }),
      client.on('nodeMoved', () => {
        void invalidateNodeLists(qc, workspaceId);
        invalidateNodeMirrors(qc, workspaceId);
      }),
      client.on('presence', ({ nodeId, users }) => usePresenceStore.getState().setPresence(nodeId, users)),
      client.on('documentChanged', ({ nodeId }) => {
        // The title lives in the Y.Doc; a store may have changed `nodes.title` behind our back.
        void qc.invalidateQueries({ queryKey: queryKeys.node(workspaceId, nodeId) });
        void qc.invalidateQueries({ queryKey: ['ancestors', workspaceId] });
      }),
      // --- §7.6
      client.on('favoritesChanged', ({ workspaceId: ws }) => {
        void qc.invalidateQueries({ queryKey: queryKeys.favorites(ws || workspaceId) });
      }),
      client.on('nodeArchived', ({ id, archivedAt }) => {
        const prev = qc.getQueryData<Node>(queryKeys.node(workspaceId, id));
        if (prev) patchNodeEverywhere(qc, workspaceId, { ...prev, archivedAt });
        void invalidateNodeLists(qc, workspaceId);
      }),
      client.on('nodeRestored', ({ node }) => {
        patchNodeEverywhere(qc, node.workspaceId, node);
        void invalidateNodeLists(qc, node.workspaceId);
        invalidateNodeMirrors(qc, node.workspaceId);
        void qc.invalidateQueries({ queryKey: ['trash', node.workspaceId] });
      }),
      client.on('trashChanged', ({ workspaceId: ws }) => {
        void qc.invalidateQueries({ queryKey: ['trash', ws || workspaceId] });
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

/**
 * Subscribes to one hub message for the lifetime of the component (contracts §5, §7.6, §9.9).
 * The handler may change between renders without re-subscribing. No-op in mock mode / offline.
 *
 *   useHubEvent('tagsChanged', ({ nodeId, tags }) => …);
 */
export function useHubEvent<E extends HubEventName>(event: E, handler: HubEvents[E]): void {
  const client = useRealtime();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!client) return;
    const forward = ((payload: unknown) =>
      (ref.current as (p: unknown) => void)(payload)) as unknown as HubEvents[E];
    return client.on(event, forward);
  }, [client, event]);
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
