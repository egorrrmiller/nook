import { Server, type Document, type onStoreDocumentPayload } from "@hocuspocus/server";
import { AuthError, type ConnectionContext, nodeIdFromDocumentName, verifyCollabToken } from "./auth.js";
import { BackendClient, BackendConflictError } from "./backend.js";
import { applyEncodedDoc, BlockNoteBridge, encodeDoc, FRAGMENT_NAME } from "./blocknote.js";
import type { CollabConfig } from "./config.js";
import { DocRegistry, type DocState } from "./docs.js";
import type { Logger } from "./logger.js";

export interface CollabDeps {
  config: CollabConfig;
  log: Logger;
  backend: BackendClient;
  bridge: BlockNoteBridge;
  registry: DocRegistry;
}

/** Quick in-hook retries (ms) before giving up and leaving the document in memory. */
const IN_HOOK_BACKOFF = [500, 1000, 2000];
/** Outer retry loop after the hook gave up: 2^failures seconds, capped. */
const MAX_OUTER_BACKOFF_MS = 30_000;

export const SYSTEM_USER = { id: "system", name: "Nook", color: "#64748b" } as const;

export function createHocuspocusServer(deps: CollabDeps): Server<ConnectionContext> {
  const { config, log, backend, bridge, registry } = deps;
  const secret = new TextEncoder().encode(config.jwtSecret);

  const server = new Server<ConnectionContext>({
    name: "nook-collab",
    address: config.host,
    // Set here rather than via listen(port): Server.listen treats a falsy port (0 = "pick a free port",
    // used by the tests) as "not given" and would fall back to Hocuspocus' default of 80.
    port: config.port,
    quiet: true,
    stopOnSignals: false,
    debounce: config.storeDebounceMs,
    maxDebounce: config.storeMaxDebounceMs,
    unloadImmediately: true,

    async onAuthenticate({ token, documentName, connectionConfig, socketId }) {
      try {
        const { context } = await verifyCollabToken(token, secret, documentName);
        if (context.role === "viewer") connectionConfig.readOnly = true;
        log.debug({ documentName, socketId, userId: context.user.id, role: context.role }, "authenticated");
        return context;
      } catch (err) {
        log.warn({ documentName, socketId, err: err instanceof Error ? err.message : String(err) }, "authentication rejected");
        // A message-less rejection keeps Hocuspocus from console.error-ing on top of our log line;
        // the client still receives `reason: "permission-denied"`.
        throw { reason: err instanceof AuthError ? err.reason : "permission-denied" };
      }
    },

    async onLoadDocument({ document, documentName }) {
      const nodeId = nodeIdFromDocumentName(documentName);
      const state = registry.ensure(documentName, nodeId);
      const record = await backend.getDocument(nodeId); // throws → connection fails, client retries
      state.version = record.version;
      if (record.ydoc) {
        applyEncodedDoc(document, record.ydoc, { source: "local", skipStoreHooks: true, context: { load: true } });
      }
      if (document.getXmlFragment(FRAGMENT_NAME).length === 0) {
        // null from the backend (new page) — or an empty/corrupt state: start with one empty paragraph.
        bridge.initEmptyDocument(document);
        state.dirty = true;
      }
      log.info({ documentName, version: state.version, fresh: !record.ydoc }, "document loaded");
    },

    async onChange({ documentName, update, context }) {
      const state = registry.get(documentName);
      if (!state) return;
      registry.recordChange(state, update, context?.user?.id);
    },

    async onStoreDocument(payload) {
      const state = registry.get(payload.documentName);
      if (!state) return;
      await storeDocument(payload, state);
    },

    async afterUnloadDocument({ documentName }) {
      const state = registry.get(documentName);
      if (state?.dirty) log.error({ documentName }, "document unloaded while dirty — edits may not have been persisted");
      registry.delete(documentName);
      log.debug({ documentName }, "document unloaded");
    },

    async onRequest({ request, response }) {
      const path = (request.url ?? "/").split("?")[0];
      if (path === "/healthz" || path === "/health") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify(healthBody()));
        // Rejecting with a falsy value tells Hocuspocus the request was handled.
        return Promise.reject(null);
      }
      return undefined;
    },
  });

  function healthBody() {
    const dirty = registry.all().filter((s) => s.dirty).length;
    return {
      ok: true,
      documents: server.hocuspocus.getDocumentsCount(),
      connections: server.hocuspocus.getConnectionsCount(),
      dirtyDocuments: dirty,
    };
  }

  /**
   * Persist one document to the backend. Retries transient failures with a short backoff; on a
   * 409 conflict merges the backend's state into the live doc and retries once. If everything fails
   * the error propagates — Hocuspocus then keeps the document in memory — and an outer timer
   * re-schedules the store so edits are never lost while the backend is down.
   */
  async function storeDocument(payload: onStoreDocumentPayload<ConnectionContext>, state: DocState): Promise<void> {
    const { document, documentName } = payload;
    if (state.retryTimer) {
      clearTimeout(state.retryTimer);
      state.retryTimer = undefined;
    }
    if (!state.dirty) {
      log.trace({ documentName }, "store skipped: not dirty");
      return;
    }

    let conflictReloaded = false;
    for (let attempt = 0; ; attempt++) {
      const batch = registry.takeBatch(state);
      const body = {
        ydoc: encodeDoc(document),
        version: state.version,
        title: bridge.readTitle(document),
        blocks: bridge.docToBlocks(document),
        updates: batch.updates.map((u) => Buffer.from(u).toString("base64")),
        userIds: batch.authors,
      };
      try {
        const { version } = await backend.putDocument(state.nodeId, body);
        batch.commit();
        state.version = version;
        state.dirty = state.updates.length > 0;
        state.failures = 0;
        log.info(
          { documentName, version, blocks: body.blocks.length, updates: body.updates.length, authors: body.userIds },
          "document stored",
        );
        return;
      } catch (err) {
        if (err instanceof BackendConflictError && !conflictReloaded) {
          conflictReloaded = true;
          log.warn({ documentName, version: state.version }, "store conflict (409): reloading document from backend");
          const record = await backend.getDocument(state.nodeId);
          if (record.ydoc) {
            // Yjs merge: keeps our unsaved edits and folds in whatever the backend has.
            applyEncodedDoc(document, record.ydoc, { source: "local", skipStoreHooks: true, context: { reload: true } });
          }
          state.version = record.version;
          state.dirty = true;
          continue;
        }
        const backoff = IN_HOOK_BACKOFF[attempt];
        if (backoff !== undefined && !(err instanceof BackendConflictError)) {
          log.warn({ documentName, attempt: attempt + 1, err: errMessage(err) }, "store failed, retrying");
          await sleep(backoff);
          continue;
        }
        state.failures++;
        const outer = Math.min(MAX_OUTER_BACKOFF_MS, 1000 * 2 ** Math.min(state.failures, 10));
        log.error(
          { documentName, failures: state.failures, retryInMs: outer, err: errMessage(err) },
          "store failed; keeping document in memory and retrying later",
        );
        state.retryTimer = setTimeout(() => {
          state.retryTimer = undefined;
          if (document.isDestroyed || registry.get(documentName) !== state) return;
          server.hocuspocus.storeDocumentHooks(document, payload, true).catch(() => undefined);
        }, outer);
        state.retryTimer.unref?.();
        throw err;
      }
    }
  }

  return server;
}

/**
 * Open a direct (server-side) connection, run `fn` inside a Y transaction on the live document and
 * close the connection. If the document was not loaded, this loads it (onLoadDocument), applies the
 * change and unloads it again, which triggers an immediate store.
 */
export async function withDirectConnection<T>(
  server: Server<ConnectionContext>,
  documentName: string,
  context: ConnectionContext,
  fn: (doc: Document) => T,
): Promise<T> {
  const connection = await server.hocuspocus.openDirectConnection(documentName, context);
  try {
    let result!: T;
    await connection.transact((doc) => {
      result = fn(doc);
    });
    return result;
  } finally {
    await connection.disconnect({ unloadImmediately: true });
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}${err.cause ? ` (${String(err.cause)})` : ""}` : String(err);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
