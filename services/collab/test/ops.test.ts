/** Unit tests for the headless BlockNote bridge on a plain Y.Doc (no server). */
import { randomUUID } from "node:crypto";
import * as Y from "yjs";
import { describe, expect, it } from "vitest";
import { BlockNoteBridge, FRAGMENT_NAME, OpError } from "../src/blocknote.js";
import { allText, appendParagraph, blockText } from "./helpers.js";

const bridge = new BlockNoteBridge();

function freshDoc(): Y.Doc {
  const doc = new Y.Doc();
  bridge.initEmptyDocument(doc);
  return doc;
}

describe("BlockNoteBridge", () => {
  it("initialises a new document with one empty paragraph and a uuid id", () => {
    const doc = freshDoc();
    const blocks = bridge.docToBlocks(doc);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.type).toBe("paragraph");
    expect(blocks[0]!.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(blocks[0]!.content).toEqual([]);
    expect(bridge.readTitle(doc)).toBe("");
  });

  it("reads blocks written by a client (y-prosemirror layout) with default props filled in", () => {
    const doc = freshDoc();
    appendParagraph(doc, "typed");
    const blocks = bridge.docToBlocks(doc);
    expect(blocks).toHaveLength(2);
    expect(blockText(blocks[1]!)).toBe("typed");
    expect(blocks[1]!.props).toMatchObject({ textAlignment: "left", textColor: "default", backgroundColor: "default" });
  });

  it("insert replaces the lone empty paragraph, then appends; before/after honour the reference", () => {
    const doc = freshDoc();
    doc.transact(() => bridge.applyOps(doc, [{ op: "insert", blocks: [{ type: "paragraph", content: "one" }], placement: "end" }]));
    expect(allText(bridge.docToBlocks(doc))).toEqual(["one"]);

    doc.transact(() => bridge.applyOps(doc, [{ op: "insert", blocks: [{ type: "paragraph", content: "three" }], placement: "end" }]));
    const [one, three] = bridge.docToBlocks(doc);
    doc.transact(() =>
      bridge.applyOps(doc, [
        { op: "insert", blocks: [{ type: "paragraph", content: "two" }], referenceBlockId: three!.id, placement: "before" },
        { op: "insert", blocks: [{ type: "paragraph", content: "zero" }], referenceBlockId: one!.id, placement: "before" },
        { op: "insert", blocks: [{ type: "paragraph", content: "four" }], referenceBlockId: three!.id, placement: "after" },
      ]),
    );
    expect(allText(bridge.docToBlocks(doc))).toEqual(["zero", "one", "two", "three", "four"]);
    // Existing blocks keep their ids (structural diff, not a rewrite).
    expect(bridge.docToBlocks(doc).map((b) => b.id)).toContain(one!.id);
    expect(bridge.docToBlocks(doc).map((b) => b.id)).toContain(three!.id);
  });

  it("update, replace, remove and setTitle", () => {
    const doc = freshDoc();
    const id = randomUUID();
    appendParagraph(doc, "hello", id);
    doc.transact(() => bridge.applyOps(doc, [{ op: "update", blockId: id, block: { type: "heading", props: { level: 2 }, content: "Hello" } }]));
    let block = bridge.docToBlocks(doc).find((b) => b.id === id)!;
    expect(block.type).toBe("heading");
    expect(block.props.level).toBe(2);
    expect(blockText(block)).toBe("Hello");

    doc.transact(() =>
      bridge.applyOps(doc, [{ op: "replace", blockId: id, blocks: [{ type: "checkListItem", props: { checked: true }, content: "done" }] }]),
    );
    expect(bridge.docToBlocks(doc).find((b) => b.id === id)).toBeUndefined();
    block = bridge.docToBlocks(doc).find((b) => b.type === "checkListItem")!;
    expect(block.props.checked).toBe(true);

    const result = doc.transact(() => bridge.applyOps(doc, [{ op: "setTitle", title: "Titled" }, { op: "remove", blockIds: [block.id] }]));
    expect(result).toEqual({ applied: 2, title: "Titled" });
    expect(bridge.readTitle(doc)).toBe("Titled");
    expect(bridge.docToBlocks(doc).some((b) => b.id === block.id)).toBe(false);
  });

  it("removing every block leaves a single empty paragraph", () => {
    const doc = freshDoc();
    const ids = bridge.docToBlocks(doc).map((b) => b.id);
    doc.transact(() => bridge.applyOps(doc, [{ op: "remove", blockIds: ids }]));
    const blocks = bridge.docToBlocks(doc);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.type).toBe("paragraph");
    expect(blocks[0]!.content).toEqual([]);
  });

  it("a failing op leaves the document untouched (atomic batch) and reports a useful status", () => {
    const doc = freshDoc();
    const before = Y.encodeStateAsUpdate(doc);
    const run = (ops: unknown) => doc.transact(() => bridge.applyOps(doc, ops as never));
    expect(() => run([{ op: "insert", blocks: [{ type: "paragraph", content: "x" }] }, { op: "update", blockId: "nope", block: {} }])).toThrow(OpError);
    expect(() => run([{ op: "remove", blockIds: ["missing"] }])).toThrowError(/not found/);
    expect(() => run([{ op: "bogus" }])).toThrowError(/unknown op/);
    expect(() => run([{ op: "insert", blocks: [] }])).toThrowError(/non-empty/);
    expect(() => run("nope")).toThrowError(/array/);
    expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
  });

  it("writes minimal Y updates: untouched sibling blocks are not re-created", () => {
    const doc = freshDoc();
    const keep = randomUUID();
    const text = appendParagraph(doc, "keep me", keep);
    const group = doc.getXmlFragment(FRAGMENT_NAME).get(0) as Y.XmlElement;
    const containerBefore = group.toArray().find((c) => (c as Y.XmlElement).getAttribute("id") === keep);

    doc.transact(() => bridge.applyOps(doc, [{ op: "insert", blocks: [{ type: "paragraph", content: "new" }], placement: "end" }]));

    const containerAfter = group.toArray().find((c) => (c as Y.XmlElement).getAttribute("id") === keep);
    expect(containerAfter).toBe(containerBefore); // same Y item instance
    expect(text.toString()).toBe("keep me");
    expect(text.doc).toBe(doc); // not deleted/re-created
  });

  it("importDocument replaces content and title", () => {
    const doc = freshDoc();
    appendParagraph(doc, "old");
    doc.transact(() => bridge.importDocument(doc, "New title", [{ type: "heading", props: { level: 1 }, content: "H" }, { type: "paragraph", content: "P" }]));
    expect(allText(bridge.docToBlocks(doc))).toEqual(["H", "P"]);
    expect(bridge.readTitle(doc)).toBe("New title");
    doc.transact(() => bridge.importDocument(doc, "", []));
    expect(bridge.docToBlocks(doc)).toHaveLength(1);
    expect(bridge.docToBlocks(doc)[0]!.type).toBe("paragraph");
  });
});
