/**
 * In-memory stand-in for the C# internal document API (contracts.md §3):
 *   GET /internal/documents/{id} -> {ydoc: base64|null, version}
 *   PUT /internal/documents/{id} {ydoc, version, title, blocks, updates?, userIds} -> {version} | 409
 */
import { serve, type ServerType } from "@hono/node-server";
import { Hono } from "hono";
import type { StoreDocumentRequest } from "../src/backend.js";

export interface PutRecord {
  nodeId: string;
  body: StoreDocumentRequest;
  at: number;
}

export class FakeBackend {
  readonly docs = new Map<string, { ydoc: string; version: number; title: string }>();
  readonly puts: PutRecord[] = [];
  readonly gets: string[] = [];
  /** When true every request fails with 503 (simulates backend downtime). */
  down = false;
  private server!: ServerType;
  url = "";

  private constructor(readonly token: string) {}

  static async start(token: string): Promise<FakeBackend> {
    const fb = new FakeBackend(token);
    const app = new Hono();
    app.use("*", async (c, next) => {
      if (c.req.header("X-Internal-Token") !== fb.token) return c.json({ error: "unauthorized" }, 401);
      if (fb.down) return c.json({ error: "backend down" }, 503);
      await next();
    });
    app.get("/internal/documents/:id", (c) => {
      const id = c.req.param("id");
      fb.gets.push(id);
      const doc = fb.docs.get(id);
      return c.json(doc ? { ydoc: doc.ydoc, version: doc.version } : { ydoc: null, version: 0 });
    });
    app.put("/internal/documents/:id", async (c) => {
      const id = c.req.param("id");
      const body = (await c.req.json()) as StoreDocumentRequest;
      const stored = fb.docs.get(id);
      const storedVersion = stored?.version ?? 0;
      if (body.version < storedVersion) return c.json({ error: "version conflict", version: storedVersion }, 409);
      const version = storedVersion + 1;
      fb.docs.set(id, { ydoc: body.ydoc, version, title: body.title });
      fb.puts.push({ nodeId: id, body, at: Date.now() });
      return c.json({ version });
    });
    await new Promise<void>((resolve) => {
      fb.server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" }, (info) => {
        fb.url = `http://127.0.0.1:${info.port}`;
        resolve();
      });
    });
    return fb;
  }

  putsFor(nodeId: string): PutRecord[] {
    return this.puts.filter((p) => p.nodeId === nodeId);
  }

  async waitForPut(nodeId: string, predicate: (p: PutRecord) => boolean = () => true, timeoutMs = 15_000): Promise<PutRecord> {
    const started = Date.now();
    for (;;) {
      const hit = this.putsFor(nodeId).find(predicate);
      if (hit) return hit;
      if (Date.now() - started > timeoutMs) throw new Error(`no matching PUT for ${nodeId} within ${timeoutMs}ms (${this.putsFor(nodeId).length} PUTs seen)`);
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}
