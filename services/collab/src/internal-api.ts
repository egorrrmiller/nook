import { timingSafeEqual } from "node:crypto";
import type { Server } from "@hocuspocus/server";
import { Hono } from "hono";
import * as Y from "yjs";
import { type ConnectionContext, documentNameForNode } from "./auth.js";
import { BackendHttpError } from "./backend.js";
import { applyEncodedDoc, OpError } from "./blocknote.js";
import { type CollabDeps, SYSTEM_USER, withDirectConnection } from "./hocuspocus.js";
import type { ConvertRequest, DocOp, PartialBlockInput } from "./types.js";

const NODE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Internal HTTP API (contracts.md §3, "Server-side edits"). Guarded by X-Internal-Token.
 * Served on COLLAB_INTERNAL_PORT (default 1235) — deliberately not the WebSocket port, so the
 * public `/collab` proxy can never reach it.
 */
export function createInternalApi(deps: CollabDeps, server: Server<ConnectionContext>): Hono {
  const { config, log, backend, bridge, registry } = deps;
  const app = new Hono();
  const expectedToken = Buffer.from(config.internalToken);

  app.get("/healthz", (c) =>
    c.json({
      ok: true,
      documents: server.hocuspocus.getDocumentsCount(),
      connections: server.hocuspocus.getConnectionsCount(),
      dirtyDocuments: registry.all().filter((s) => s.dirty).length,
    }),
  );

  app.use("/internal/*", async (c, next) => {
    const given = Buffer.from(c.req.header("X-Internal-Token") ?? "");
    if (given.length !== expectedToken.length || !timingSafeEqual(given, expectedToken)) {
      return c.json({ error: "invalid internal token" }, 401);
    }
    await next();
  });

  app.onError((err, c) => {
    if (err instanceof OpError) return c.json({ error: err.message }, err.status);
    if (err instanceof BackendHttpError) {
      log.warn({ err: err.message }, "backend error while serving internal request");
      return c.json({ error: `backend: ${err.message}` }, 502);
    }
    if (err instanceof SyntaxError) return c.json({ error: `invalid JSON: ${err.message}` }, 400);
    log.error({ err }, "internal API error");
    return c.json({ error: err instanceof Error ? err.message : "internal error" }, 500);
  });

  const contextFor = (userId: string | undefined): ConnectionContext => ({
    user: userId ? { id: userId, name: userId, color: SYSTEM_USER.color } : { ...SYSTEM_USER },
    role: "editor",
    source: "internal",
  });

  const nodeIdParam = (raw: string): string => {
    if (!NODE_ID.test(raw)) throw new OpError(400, "invalid node id");
    return raw;
  };

  app.post("/internal/docs/:nodeId/ops", async (c) => {
    const nodeId = nodeIdParam(c.req.param("nodeId"));
    const ops = (await c.req.json()) as DocOp[];
    if (!Array.isArray(ops)) throw new OpError(400, "body must be an array of ops");
    const ctx = contextFor(c.req.header("X-Nook-User-Id"));
    const result = await withDirectConnection(server, documentNameForNode(nodeId), ctx, (doc) => bridge.applyOps(doc, ops));
    log.info({ nodeId, applied: result.applied, userId: ctx.user.id }, "ops applied");
    return c.json({ applied: result.applied });
  });

  app.post("/internal/docs/:nodeId/import", async (c) => {
    const nodeId = nodeIdParam(c.req.param("nodeId"));
    const body = (await c.req.json()) as { title?: unknown; blocks?: unknown };
    const title = typeof body.title === "string" ? body.title : "";
    if (!Array.isArray(body.blocks)) throw new OpError(400, "blocks must be an array");
    const blocks = body.blocks as PartialBlockInput[];
    const ctx = contextFor(c.req.header("X-Nook-User-Id"));
    await withDirectConnection(server, documentNameForNode(nodeId), ctx, (doc) => bridge.importDocument(doc, title, blocks));
    log.info({ nodeId, blocks: blocks.length, userId: ctx.user.id }, "document imported");
    return c.json({ ok: true, blocks: blocks.length });
  });

  app.get("/internal/docs/:nodeId/blocks", async (c) => {
    const nodeId = nodeIdParam(c.req.param("nodeId"));
    const documentName = documentNameForNode(nodeId);
    const live = server.hocuspocus.documents.get(documentName);
    if (live && !live.isLoading) {
      return c.json({ title: bridge.readTitle(live), blocks: bridge.docToBlocks(live) });
    }
    // Not loaded: read straight from the backend without pulling the document into memory.
    const record = await backend.getDocument(nodeId);
    if (!record.ydoc) return c.json({ title: "", blocks: [] });
    const doc = new Y.Doc();
    try {
      applyEncodedDoc(doc, record.ydoc);
      return c.json({ title: bridge.readTitle(doc), blocks: bridge.docToBlocks(doc) });
    } finally {
      doc.destroy();
    }
  });

  app.post("/internal/convert", async (c) => {
    const body = (await c.req.json()) as Partial<ConvertRequest> & { htmlMode?: "full" | "lossy" };
    if (body.to === "blocks" && (body.from === "markdown" || body.from === "html")) {
      if (typeof body.content !== "string") throw new OpError(400, "content must be a string");
      const result = body.from === "markdown" ? await bridge.markdownToBlocks(body.content) : await bridge.htmlToBlocks(body.content);
      return c.json({ result });
    }
    if (body.from === "blocks" && (body.to === "markdown" || body.to === "html")) {
      if (!Array.isArray(body.blocks)) throw new OpError(400, "blocks must be an array");
      const result =
        body.to === "markdown"
          ? await bridge.blocksToMarkdown(body.blocks)
          : await bridge.blocksToHtml(body.blocks, body.htmlMode === "lossy" ? "lossy" : "full");
      return c.json({ result });
    }
    throw new OpError(400, 'unsupported conversion: expected {from:"markdown"|"html",to:"blocks"} or {from:"blocks",to:"markdown"|"html"}');
  });

  app.notFound((c) => c.json({ error: "not found" }, 404));
  return app;
}
