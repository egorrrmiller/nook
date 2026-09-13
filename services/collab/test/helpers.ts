import { randomUUID } from "node:crypto";
import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import { SignJWT } from "jose";
import { WebSocket } from "ws";
import * as Y from "yjs";
import { BlockNoteBridge, FRAGMENT_NAME, TITLE_NAME } from "../src/blocknote.js";
import { loadConfig } from "../src/config.js";
import { createLogger } from "../src/logger.js";
import { type RunningCollab, startCollab } from "../src/server.js";
import type { Block } from "../src/types.js";
import { FakeBackend } from "./fake-backend.js";

export const INTERNAL_TOKEN = "test-internal-token";
export const JWT_SECRET = "test-collab-jwt-secret-with-enough-entropy";

export const bridge = new BlockNoteBridge();

export interface TestStack {
  backend: FakeBackend;
  collab: RunningCollab;
  stop(): Promise<void>;
}

export async function startStack(opts: { debounceMs?: number; maxDebounceMs?: number } = {}): Promise<TestStack> {
  const backend = await FakeBackend.start(INTERNAL_TOKEN);
  const config = loadConfig({
    port: 0,
    internalPort: 0,
    host: "127.0.0.1",
    apiBase: backend.url,
    internalToken: INTERNAL_TOKEN,
    jwtSecret: JWT_SECRET,
    storeDebounceMs: opts.debounceMs ?? 300,
    storeMaxDebounceMs: opts.maxDebounceMs ?? 1000,
    backendTimeoutMs: 2000,
    shutdownTimeoutMs: 5000,
    logLevel: process.env.TEST_LOG_LEVEL ?? "silent",
    logPretty: false,
  });
  const log = createLogger({ level: config.logLevel, pretty: false });
  const collab = await startCollab(config, log);
  return {
    backend,
    collab,
    stop: async () => {
      await collab.stop();
      await backend.stop();
    },
  };
}

export interface TokenClaims {
  sub?: string;
  name?: string;
  color?: string;
  node: string;
  role?: "editor" | "viewer";
}

export async function mintToken(claims: TokenClaims, secret = JWT_SECRET, expiresIn = "10m"): Promise<string> {
  const { sub = "user-" + randomUUID().slice(0, 8), name = "Test User", color = "#ff0000", node, role = "editor" } = claims;
  return new SignJWT({ name, color, node, role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(new TextEncoder().encode(secret));
}

export interface TestClient {
  doc: Y.Doc;
  provider: HocuspocusProvider;
  socket: HocuspocusProviderWebsocket;
  /** Resolves once the initial sync completed. */
  synced: Promise<void>;
  /** Resolves with the authorization scope once authenticated. */
  authenticated: Promise<"read-write" | "readonly">;
  /** Resolves with the reason if authentication failed. */
  authFailed: Promise<string>;
  destroy(): void;
}

export function connectClient(wsUrl: string, documentName: string, token: string): TestClient {
  const doc = new Y.Doc();
  const socket = new HocuspocusProviderWebsocket({ url: wsUrl, WebSocketPolyfill: WebSocket });
  let resolveSynced!: () => void;
  let resolveAuth!: (scope: "read-write" | "readonly") => void;
  let resolveFailed!: (reason: string) => void;
  const synced = new Promise<void>((r) => (resolveSynced = r));
  const authenticated = new Promise<"read-write" | "readonly">((r) => (resolveAuth = r));
  const authFailed = new Promise<string>((r) => (resolveFailed = r));
  const provider = new HocuspocusProvider({
    websocketProvider: socket,
    name: documentName,
    document: doc,
    token,
    onSynced: ({ state }) => {
      if (state) resolveSynced();
    },
    onAuthenticated: ({ scope }) => resolveAuth(scope),
    onAuthenticationFailed: ({ reason }) => resolveFailed(reason),
  });
  // When a websocketProvider is supplied explicitly, HocuspocusProvider leaves `manageSocket`
  // false and never attaches itself — nothing would ever connect. attach() is idempotent and
  // destroy() detaches, so this is safe to call unconditionally.
  provider.attach();
  return {
    doc,
    provider,
    socket,
    synced,
    authenticated,
    authFailed,
    destroy: () => {
      provider.destroy();
      socket.destroy();
      doc.destroy();
    },
  };
}

/** Append a paragraph block with plain text the way y-prosemirror lays it out (blockGroup > blockContainer > paragraph > text). */
export function appendParagraph(doc: Y.Doc, text: string, id = randomUUID()): Y.XmlText {
  const fragment = doc.getXmlFragment(FRAGMENT_NAME);
  let ytext!: Y.XmlText;
  doc.transact(() => {
    let group = fragment.get(0) as Y.XmlElement | undefined;
    if (!group) {
      group = new Y.XmlElement("blockGroup");
      fragment.insert(0, [group]);
    }
    const container = new Y.XmlElement("blockContainer");
    container.setAttribute("id", id);
    const paragraph = new Y.XmlElement("paragraph");
    ytext = new Y.XmlText();
    ytext.insert(0, text);
    paragraph.insert(0, [ytext]);
    container.insert(0, [paragraph]);
    group.push([container]);
  });
  return ytext;
}

/** Find the XmlText inside the paragraph of the block with the given id. */
export function paragraphText(doc: Y.Doc, blockId: string): Y.XmlText | undefined {
  const group = doc.getXmlFragment(FRAGMENT_NAME).get(0) as Y.XmlElement | undefined;
  if (!group) return undefined;
  for (const container of group.toArray() as Y.XmlElement[]) {
    if (container.getAttribute("id") !== blockId) continue;
    const paragraph = container.get(0) as Y.XmlElement | undefined;
    return paragraph?.get(0) as Y.XmlText | undefined;
  }
  return undefined;
}

export function setTitle(doc: Y.Doc, title: string): void {
  const t = doc.getText(TITLE_NAME);
  doc.transact(() => {
    t.delete(0, t.length);
    t.insert(0, title);
  });
}

export function blocksOf(doc: Y.Doc): Block[] {
  return bridge.docToBlocks(doc);
}

/** Concatenated plain text of a block's inline content. */
export function blockText(block: Block): string {
  if (!Array.isArray(block.content)) return "";
  return (block.content as Array<{ type: string; text?: string; content?: Array<{ text: string }> }>)
    .map((ic) => (ic.type === "text" ? (ic.text ?? "") : ic.type === "link" ? (ic.content ?? []).map((t) => t.text).join("") : ""))
    .join("");
}

export function allText(blocks: Block[]): string[] {
  return blocks.flatMap((b) => [blockText(b), ...allText(b.children ?? [])]);
}

export async function waitFor(check: () => boolean | Promise<boolean>, timeoutMs = 10_000, what = "condition"): Promise<void> {
  const started = Date.now();
  for (;;) {
    if (await check()) return;
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function internal(stack: TestStack, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${stack.collab.internalUrl}${path}`, {
    method,
    headers: { "X-Internal-Token": INTERNAL_TOKEN, "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = undefined;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = text;
  }
  return { status: res.status, json: json as any };
}
