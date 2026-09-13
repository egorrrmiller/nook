import { HocuspocusProvider } from '@hocuspocus/provider';
import { api as defaultApi, decodeCollabToken, type ApiClient, type CollabTokenClaims } from '@nook/api-client';
import { useEffect, useState } from 'react';
import * as Y from 'yjs';
import { documentName, resolveWsUrl } from './wsUrl';

export type CollabMode = 'remote' | 'local';
export type CollabStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'local' | 'error';

export interface CollabSession {
  doc: Y.Doc;
  provider: HocuspocusProvider | null;
  status: CollabStatus;
  /** True once the initial sync finished (always true in local mode). */
  synced: boolean;
  error: string | null;
  claims: CollabTokenClaims | null;
}

export interface UseCollabSessionOptions {
  mode?: CollabMode;
  client?: ApiClient;
  /** Seeds `doc.getText("title")` in local mode when the doc is empty. */
  initialTitle?: string;
  /** `false` keeps the hook inert (the caller already owns a session). Default `true`. */
  enabled?: boolean;
}

/**
 * Owns the Y.Doc + HocuspocusProvider for a node (contracts §3):
 * token from `GET /api/collab/token?nodeId=`, document `node:<id>`, ws at `wsUrl`.
 * Re-fetches the token on every (re)connect since it expires after 10 minutes.
 */
export function useCollabSession(nodeId: string, options: UseCollabSessionOptions = {}): CollabSession | null {
  const { mode = 'remote', client = defaultApi, initialTitle, enabled = true } = options;
  const [session, setSession] = useState<CollabSession | null>(null);

  useEffect(() => {
    if (!enabled || !nodeId) {
      setSession(null);
      return;
    }
    const doc = new Y.Doc();
    let provider: HocuspocusProvider | null = null;
    let cancelled = false;
    const ac = new AbortController();

    if (mode === 'local') {
      const title = doc.getText('title');
      if (initialTitle && title.length === 0) title.insert(0, initialTitle);
      setSession({ doc, provider: null, status: 'local', synced: true, error: null, claims: null });
      return () => doc.destroy();
    }

    setSession({ doc, provider: null, status: 'connecting', synced: false, error: null, claims: null });
    const patch = (p: Partial<CollabSession>) => {
      if (!cancelled) setSession((s) => (s ? { ...s, ...p } : s));
    };

    (async () => {
      try {
        const first = await client.collab.token(nodeId, ac.signal);
        if (cancelled) return;
        let cached: string | null = first.token;
        patch({ claims: decodeCollabToken(first.token) });

        provider = new HocuspocusProvider({
          url: resolveWsUrl(first.wsUrl),
          name: documentName(nodeId),
          document: doc,
          token: async () => {
            if (cached) {
              const t = cached;
              cached = null;
              return t;
            }
            const fresh = await client.collab.token(nodeId);
            patch({ claims: decodeCollabToken(fresh.token) });
            return fresh.token;
          },
          onStatus: ({ status }) => patch({ status: status as CollabStatus }),
          onSynced: () => patch({ synced: true }),
          onAuthenticationFailed: ({ reason }) => patch({ status: 'error', error: reason || 'Authentication failed' }),
        });
        patch({ provider });
      } catch (e) {
        if (cancelled) return;
        patch({ status: 'error', error: e instanceof Error ? e.message : String(e) });
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
      provider?.destroy();
      doc.destroy();
    };
    // initialTitle only seeds a fresh local doc; changing it must not recreate the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId, mode, client, enabled]);

  return session;
}
