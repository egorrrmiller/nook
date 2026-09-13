import type { Node } from '@nook/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { isMock } from '../lib/env';
import { keys } from '../lib/api';
import { usePresenceStore } from '../stores/presence';
import { getHub } from './hub';

/** Connects to `/hub`, watches the workspace and keeps the query cache in sync. No-op in mock mode. */
export function useWorkspaceHub(workspaceId: string): void {
  const qc = useQueryClient();
  useEffect(() => {
    if (isMock) return;
    const hub = getHub();
    const offs = [
      hub.on('nodeChanged', ({ node }) => {
        qc.setQueryData<Node>(keys.node(node.id), node);
        void qc.invalidateQueries({ queryKey: keys.nodes(node.workspaceId, node.parentId) });
        void qc.invalidateQueries({ queryKey: ['ancestors'] });
      }),
      hub.on('nodeDeleted', ({ id }) => {
        const prev = qc.getQueryData<Node>(keys.node(id));
        qc.removeQueries({ queryKey: keys.node(id) });
        void qc.invalidateQueries({ queryKey: prev ? keys.nodes(prev.workspaceId, prev.parentId) : ['nodes'] });
      }),
      hub.on('nodeMoved', () => {
        void qc.invalidateQueries({ queryKey: ['nodes', workspaceId] });
        void qc.invalidateQueries({ queryKey: ['ancestors'] });
      }),
      hub.on('presence', ({ nodeId, users }) => usePresenceStore.getState().setPresence(nodeId, users)),
      hub.on('documentChanged', ({ nodeId }) => {
        void qc.invalidateQueries({ queryKey: keys.node(nodeId) });
      }),
    ];
    let cancelled = false;
    void hub
      .start()
      .then(() => {
        if (!cancelled) return hub.watchWorkspace(workspaceId);
      })
      .catch((e) => console.warn('[hub] connection failed', e));
    return () => {
      cancelled = true;
      offs.forEach((off) => off());
    };
  }, [qc, workspaceId]);
}

/** Announces presence on a node while mounted. */
export function useNodePresence(nodeId: string): void {
  useEffect(() => {
    if (isMock) return;
    const hub = getHub();
    void hub.enterNode(nodeId);
    return () => void hub.leaveNode(nodeId);
  }, [nodeId]);
}
