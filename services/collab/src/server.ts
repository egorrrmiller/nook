import type { Server } from "@hocuspocus/server";
import { serve, type ServerType } from "@hono/node-server";
import type { ConnectionContext } from "./auth.js";
import { BackendClient } from "./backend.js";
import { BlockNoteBridge } from "./blocknote.js";
import type { CollabConfig } from "./config.js";
import { DocRegistry } from "./docs.js";
import { type CollabDeps, createHocuspocusServer } from "./hocuspocus.js";
import { createInternalApi } from "./internal-api.js";
import type { Logger } from "./logger.js";

export interface RunningCollab {
  deps: CollabDeps;
  hocuspocus: Server<ConnectionContext>;
  /** Port the Hocuspocus WebSocket server ended up on (useful when config.port is 0). */
  wsPort: number;
  wsUrl: string;
  internalPort: number;
  internalUrl: string;
  /** Flush pending stores and shut everything down. Resolves even if the backend is unreachable (after the timeout). */
  stop(): Promise<void>;
}

export async function startCollab(config: CollabConfig, log: Logger): Promise<RunningCollab> {
  const deps: CollabDeps = {
    config,
    log,
    backend: new BackendClient(config.apiBase, config.internalToken, config.backendTimeoutMs, log.child({ mod: "backend" })),
    bridge: new BlockNoteBridge(),
    registry: new DocRegistry(),
  };

  const hocuspocus = createHocuspocusServer(deps);
  await hocuspocus.listen(); // port comes from the Server configuration (see createHocuspocusServer)
  const wsPort = hocuspocus.address.port;

  const app = createInternalApi(deps, hocuspocus);
  const { server: internal, port: internalPort } = await new Promise<{ server: ServerType; port: number }>((resolve, reject) => {
    const s = serve({ fetch: app.fetch, port: config.internalPort, hostname: config.host }, (info) => resolve({ server: s, port: info.port }));
    s.once("error", reject);
  });

  const hostForUrl = config.host === "0.0.0.0" || config.host === "::" ? "localhost" : config.host;
  const running: RunningCollab = {
    deps,
    hocuspocus,
    wsPort,
    wsUrl: `ws://${hostForUrl}:${wsPort}`,
    internalPort,
    internalUrl: `http://${hostForUrl}:${internalPort}`,
    stop: async () => {
      log.info("shutting down: closing internal API, flushing pending stores");
      await new Promise<void>((resolve) => internal.close(() => resolve()));
      const timeout = new Promise<"timeout">((r) => setTimeout(() => r("timeout"), config.shutdownTimeoutMs).unref());
      const outcome = await Promise.race([hocuspocus.destroy().then(() => "ok" as const), timeout]);
      if (outcome === "timeout") {
        const dirty = deps.registry.all().filter((s) => s.dirty).map((s) => s.documentName);
        log.error({ dirty }, "shutdown timed out while flushing stores — these documents may have unsaved edits");
      } else {
        log.info("shutdown complete");
      }
    },
  };
  log.info(
    { wsPort, internalPort, apiBase: config.apiBase, debounceMs: config.storeDebounceMs, maxDebounceMs: config.storeMaxDebounceMs },
    "collab service listening",
  );
  return running;
}
