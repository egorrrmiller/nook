import { randomUUID } from "node:crypto";
import * as Y from "yjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { documentNameForNode } from "../src/auth.js";
import {
  allText,
  appendParagraph,
  blocksOf,
  connectClient,
  internal,
  mintToken,
  paragraphText,
  setTitle,
  sleep,
  startStack,
  type TestStack,
  waitFor,
} from "./helpers.js";

let stack: TestStack;

beforeAll(async () => {
  stack = await startStack({ debounceMs: 300, maxDebounceMs: 1000 });
});

afterAll(async () => {
  await stack.stop();
});

describe("collab server", () => {
  it("(a) two editors editing concurrently converge to the same document", async () => {
    const nodeId = randomUUID();
    const name = documentNameForNode(nodeId);
    const a = connectClient(stack.collab.wsUrl, name, await mintToken({ sub: "alice", node: nodeId }));
    const b = connectClient(stack.collab.wsUrl, name, await mintToken({ sub: "bob", node: nodeId }));
    try {
      await Promise.all([a.synced, b.synced]);
      // Fresh document: the server initialised one empty paragraph.
      expect(blocksOf(a.doc)).toHaveLength(1);
      expect(blocksOf(a.doc)[0]!.type).toBe("paragraph");

      // Both insert a block "at the same time" (before either update reached the other side).
      const idA = randomUUID();
      const idB = randomUUID();
      appendParagraph(a.doc, "from alice", idA);
      appendParagraph(b.doc, "from bob", idB);

      await waitFor(() => {
        const ta = allText(blocksOf(a.doc));
        const tb = allText(blocksOf(b.doc));
        return ta.includes("from alice") && ta.includes("from bob") && tb.includes("from alice") && tb.includes("from bob");
      }, 10_000, "both blocks on both clients");

      // Concurrent character-level edits inside the same paragraph.
      paragraphText(a.doc, idA)!.insert(0, "A>");
      paragraphText(b.doc, idA)!.insert(0, "B>");
      await waitFor(() => {
        const ta = paragraphText(a.doc, idA)!.toString();
        const tb = paragraphText(b.doc, idA)!.toString();
        return ta === tb && ta.includes("A>") && ta.includes("B>") && ta.endsWith("from alice");
      }, 10_000, "text convergence");

      expect(blocksOf(a.doc)).toEqual(blocksOf(b.doc));
      expect(Y.encodeStateVector(a.doc)).toEqual(Y.encodeStateVector(b.doc));
    } finally {
      a.destroy();
      b.destroy();
    }
  });

  it("(b) a viewer token gets a read-only connection whose edits are dropped", async () => {
    const nodeId = randomUUID();
    const name = documentNameForNode(nodeId);
    const editor = connectClient(stack.collab.wsUrl, name, await mintToken({ sub: "editor", node: nodeId }));
    const viewer = connectClient(stack.collab.wsUrl, name, await mintToken({ sub: "viewer", node: nodeId, role: "viewer" }));
    try {
      await Promise.all([editor.synced, viewer.synced]);
      expect(await viewer.authenticated).toBe("readonly");
      expect(await editor.authenticated).toBe("read-write");

      appendParagraph(viewer.doc, "viewer wrote this");
      appendParagraph(editor.doc, "editor wrote this");

      await waitFor(() => allText(blocksOf(viewer.doc)).includes("editor wrote this"), 10_000, "editor text reaching viewer");
      await sleep(300);
      expect(allText(blocksOf(editor.doc))).not.toContain("viewer wrote this");
      const res = await internal(stack, "GET", `/internal/docs/${nodeId}/blocks`);
      expect(res.status).toBe(200);
      expect(allText(res.json.blocks)).toContain("editor wrote this");
      expect(allText(res.json.blocks)).not.toContain("viewer wrote this");
    } finally {
      editor.destroy();
      viewer.destroy();
    }
  });

  it("(c) invalid tokens are refused", async () => {
    const nodeId = randomUUID();
    const name = documentNameForNode(nodeId);
    const badSig = connectClient(stack.collab.wsUrl, name, await mintToken({ node: nodeId }, "wrong-secret"));
    const wrongNode = connectClient(stack.collab.wsUrl, name, await mintToken({ node: randomUUID() }));
    const expired = connectClient(stack.collab.wsUrl, name, await mintToken({ node: nodeId }, undefined, "-1m"));
    const garbage = connectClient(stack.collab.wsUrl, name, "not-a-jwt");
    try {
      expect(await badSig.authFailed).toBe("permission-denied");
      expect(await wrongNode.authFailed).toBe("permission-denied");
      expect(await expired.authFailed).toBe("permission-denied");
      expect(await garbage.authFailed).toBe("permission-denied");
      expect(badSig.provider.isAuthenticated).toBe(false);
    } finally {
      badSig.destroy();
      wrongNode.destroy();
      expired.destroy();
      garbage.destroy();
    }
  });

  it("(d) edits are stored to the backend as blocks JSON with the title", async () => {
    const nodeId = randomUUID();
    const name = documentNameForNode(nodeId);
    const client = connectClient(stack.collab.wsUrl, name, await mintToken({ sub: "carol", node: nodeId }));
    await client.synced;
    appendParagraph(client.doc, "hello store");
    setTitle(client.doc, "My page");

    const put = await stack.backend.waitForPut(nodeId, (p) => allText(p.body.blocks).includes("hello store"));
    expect(put.body.title).toBe("My page");
    expect(put.body.userIds).toContain("carol");
    expect(typeof put.body.version).toBe("number");
    expect(put.body.updates?.length ?? 0).toBeGreaterThan(0);
    const para = put.body.blocks.find((b) => b.type === "paragraph" && allText([b]).includes("hello store"))!;
    expect(para.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(para.content).toEqual([{ type: "text", text: "hello store", styles: {} }]);

    // The stored ydoc is a valid full state that decodes to the same document.
    const copy = new Y.Doc();
    Y.applyUpdate(copy, new Uint8Array(Buffer.from(put.body.ydoc, "base64")));
    expect(blocksOf(copy)).toEqual(put.body.blocks);
    expect(copy.getText("title").toString()).toBe("My page");

    // Disconnect → immediate final store, then the doc is unloaded and reloads from the backend.
    client.destroy();
    await waitFor(() => stack.collab.deps.registry.get(name) === undefined, 10_000, "document unload");
    const again = connectClient(stack.collab.wsUrl, name, await mintToken({ sub: "carol", node: nodeId }));
    try {
      await again.synced;
      expect(allText(blocksOf(again.doc))).toContain("hello store");
      expect(again.doc.getText("title").toString()).toBe("My page");
      expect(stack.collab.deps.registry.get(name)?.version).toBe(stack.backend.docs.get(nodeId)!.version);
    } finally {
      again.destroy();
    }
  });

  it("(e) server-side ops are applied to the live document and reach connected clients", async () => {
    const nodeId = randomUUID();
    const name = documentNameForNode(nodeId);
    const client = connectClient(stack.collab.wsUrl, name, await mintToken({ sub: "dave", node: nodeId }));
    try {
      await client.synced;
      const keep = randomUUID();
      appendParagraph(client.doc, "typed by dave", keep);
      await waitFor(async () => allText((await internal(stack, "GET", `/internal/docs/${nodeId}/blocks`)).json.blocks).includes("typed by dave"));

      const res = await internal(stack, "POST", `/internal/docs/${nodeId}/ops`, [
        { op: "insert", blocks: [{ type: "heading", props: { level: 2 }, content: "Inserted by server" }], placement: "end" },
        { op: "setTitle", title: "Set by server" },
      ]);
      expect(res.status).toBe(200);
      expect(res.json).toEqual({ applied: 2 });

      await waitFor(() => allText(blocksOf(client.doc)).includes("Inserted by server"), 10_000, "client to receive server block");
      const blocks = blocksOf(client.doc);
      const heading = blocks.find((b) => b.type === "heading")!;
      expect(heading.props.level).toBe(2);
      expect(client.doc.getText("title").toString()).toBe("Set by server");
      // The client's own block was left untouched (same id, same text).
      expect(blocks.find((b) => b.id === keep)).toBeTruthy();

      // update / replace / remove round-trip through the internal API.
      const upd = await internal(stack, "POST", `/internal/docs/${nodeId}/ops`, [
        { op: "update", blockId: heading.id, block: { content: "Updated by server", props: { level: 3 } } },
        { op: "replace", blockId: keep, blocks: [{ type: "bulletListItem", content: "replaced" }, { type: "bulletListItem", content: "twice" }] },
      ]);
      expect(upd.status).toBe(200);
      await waitFor(() => allText(blocksOf(client.doc)).includes("Updated by server") && allText(blocksOf(client.doc)).includes("twice"));
      expect(blocksOf(client.doc).find((b) => b.id === heading.id)!.props.level).toBe(3);
      expect(blocksOf(client.doc).filter((b) => b.type === "bulletListItem")).toHaveLength(2);

      const rm = await internal(stack, "POST", `/internal/docs/${nodeId}/ops`, [{ op: "remove", blockIds: [heading.id] }]);
      expect(rm.status).toBe(200);
      await waitFor(() => !blocksOf(client.doc).some((b) => b.id === heading.id));

      // Unknown block → 404 and nothing applied.
      const before = blocksOf(client.doc);
      const bad = await internal(stack, "POST", `/internal/docs/${nodeId}/ops`, [
        { op: "insert", blocks: [{ type: "paragraph", content: "never" }], placement: "end" },
        { op: "remove", blockIds: ["does-not-exist"] },
      ]);
      expect(bad.status).toBe(404);
      await sleep(200);
      expect(blocksOf(client.doc)).toEqual(before);

      // Stored to backend with the server-side edits too.
      await stack.backend.waitForPut(nodeId, (p) => allText(p.body.blocks).includes("Updated by server") && p.body.title === "Set by server");
    } finally {
      client.destroy();
    }
  });

  it("ops on an unloaded document load it, apply, store and unload", async () => {
    const nodeId = randomUUID();
    const res = await internal(stack, "POST", `/internal/docs/${nodeId}/ops`, [
      { op: "insert", blocks: [{ type: "paragraph", content: "cold insert" }] },
    ]);
    expect(res.status).toBe(200);
    const put = await stack.backend.waitForPut(nodeId);
    expect(allText(put.body.blocks)).toEqual(["cold insert"]); // the initial empty paragraph was replaced
    expect(put.body.userIds).toEqual(["system"]);
    await waitFor(() => stack.collab.deps.registry.get(documentNameForNode(nodeId)) === undefined, 5000, "unload");

    const got = await internal(stack, "GET", `/internal/docs/${nodeId}/blocks`);
    expect(got.status).toBe(200);
    expect(allText(got.json.blocks)).toEqual(["cold insert"]);

    const attributed = await internal(stack, "POST", `/internal/docs/${nodeId}/ops`, [{ op: "setTitle", title: "T" }], { "X-Nook-User-Id": "bot-1" });
    expect(attributed.status).toBe(200);
    const put2 = await stack.backend.waitForPut(nodeId, (p) => p.body.title === "T");
    expect(put2.body.userIds).toEqual(["bot-1"]);
  });

  it("import replaces the whole document", async () => {
    const nodeId = randomUUID();
    const res = await internal(stack, "POST", `/internal/docs/${nodeId}/import`, {
      title: "Imported",
      blocks: [
        { type: "heading", props: { level: 1 }, content: "Imported page" },
        { type: "paragraph", content: "body", children: [{ type: "paragraph", content: "nested" }] },
      ],
    });
    expect(res.status).toBe(200);
    const put = await stack.backend.waitForPut(nodeId, (p) => p.body.title === "Imported");
    expect(allText(put.body.blocks)).toEqual(["Imported page", "body", "nested"]);
    expect(put.body.blocks[1]!.children[0]!.type).toBe("paragraph");
  });

  it("internal API requires the token; healthz does not", async () => {
    const noToken = await fetch(`${stack.collab.internalUrl}/internal/docs/${randomUUID()}/blocks`);
    expect(noToken.status).toBe(401);
    const wrong = await fetch(`${stack.collab.internalUrl}/internal/convert`, { method: "POST", headers: { "X-Internal-Token": "nope" } });
    expect(wrong.status).toBe(401);
    const h1 = await fetch(`${stack.collab.internalUrl}/healthz`);
    expect(h1.status).toBe(200);
    expect((await h1.json()).ok).toBe(true);
    const h2 = await fetch(`http://127.0.0.1:${stack.collab.wsPort}/healthz`);
    expect(h2.status).toBe(200);
    expect((await h2.json()).ok).toBe(true);
  });

  it("(g) keeps edits in memory while the backend is down and stores them once it is back", async () => {
    const nodeId = randomUUID();
    const name = documentNameForNode(nodeId);
    const client = connectClient(stack.collab.wsUrl, name, await mintToken({ sub: "erin", node: nodeId }));
    await client.synced;

    stack.backend.down = true;
    appendParagraph(client.doc, "written during outage");
    await sleep(600); // past the debounce: the store has started failing
    client.destroy();
    await sleep(500);
    expect(stack.backend.putsFor(nodeId)).toHaveLength(0);
    const state = stack.collab.deps.registry.get(name);
    expect(state?.dirty).toBe(true);
    expect(stack.collab.hocuspocus.hocuspocus.documents.has(name)).toBe(true);

    stack.backend.down = false;
    const put = await stack.backend.waitForPut(nodeId, (p) => allText(p.body.blocks).includes("written during outage"), 25_000);
    expect(put.body.userIds).toContain("erin");
    await waitFor(() => stack.collab.deps.registry.get(name) === undefined, 10_000, "unload after recovery");
  }, 40_000);

  it("resolves a 409 by merging the backend state and storing again", async () => {
    const nodeId = randomUUID();
    const name = documentNameForNode(nodeId);
    const client = connectClient(stack.collab.wsUrl, name, await mintToken({ sub: "frank", node: nodeId }));
    try {
      await client.synced;
      appendParagraph(client.doc, "first");
      await stack.backend.waitForPut(nodeId, (p) => allText(p.body.blocks).includes("first"));

      // Someone else (e.g. a restore) bumped the version behind our back with extra content.
      const other = new Y.Doc();
      Y.applyUpdate(other, new Uint8Array(Buffer.from(stack.backend.docs.get(nodeId)!.ydoc, "base64")));
      appendParagraph(other, "from elsewhere");
      const stored = stack.backend.docs.get(nodeId)!;
      stack.backend.docs.set(nodeId, { ...stored, version: stored.version + 5, ydoc: Buffer.from(Y.encodeStateAsUpdate(other)).toString("base64") });

      appendParagraph(client.doc, "second");
      const put = await stack.backend.waitForPut(nodeId, (p) => allText(p.body.blocks).includes("second"));
      expect(put.body.version).toBe(stored.version + 5);
      expect(allText(put.body.blocks)).toEqual(expect.arrayContaining(["first", "second", "from elsewhere"]));
      await waitFor(() => allText(blocksOf(client.doc)).includes("from elsewhere"), 5000, "merged content reaching client");
    } finally {
      client.destroy();
    }
  });
});
