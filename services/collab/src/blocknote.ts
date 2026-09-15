/**
 * Bridge between Y.Doc (BlockNote's y-prosemirror layout) and BlockNote block JSON,
 * plus headless server-side editing.
 *
 * Y.Doc layout (contracts.md §3):
 *   doc.getXmlFragment("document") — the BlockNote/ProseMirror fragment
 *   doc.getText("title")           — page title
 *   doc.getMap("meta")             — reserved
 *
 * Server-side edits are applied on a scratch headless BlockNoteEditor (so a failing op never
 * touches the shared document), and the resulting ProseMirror doc is written back to the live
 * Y.XmlFragment with y-prosemirror's `prosemirrorToYXmlFragment` → `updateYFragment`. That is
 * the very same structural diff the client-side ySyncPlugin binding uses: untouched blocks keep
 * their Y items, changed text goes through `simpleDiff`, so connected clients receive minimal
 * updates and keep their cursors.
 */
import { randomUUID } from "node:crypto";
import type { DefaultBlockSchema, DefaultInlineContentSchema, DefaultStyleSchema, PartialBlock } from "@blocknote/core";
import { _blocksToProsemirrorNode } from "@blocknote/core/yjs";
import { ServerBlockNoteEditor } from "@blocknote/server-util";
import { prosemirrorToYXmlFragment } from "y-prosemirror";
import * as Y from "yjs";
import type { Block, DocOp, PartialBlockInput } from "./types.js";

export const FRAGMENT_NAME = "document";
export const TITLE_NAME = "title";
export const META_NAME = "meta";

// Incoming block JSON is deliberately loosely typed (contracts §4), hence the `as unknown as` casts.
// The live-document serializer below is schema-agnostic; the headless editor is still used for
// server-side operations and markdown/HTML conversion where a concrete schema is required.
type AnyPartialBlock = PartialBlock<DefaultBlockSchema, DefaultInlineContentSchema, DefaultStyleSchema>;

export class OpError extends Error {
  constructor(
    readonly status: 400 | 404,
    message: string,
  ) {
    super(message);
    this.name = "OpError";
  }
}

export interface AppliedOps {
  applied: number;
  /** New title if a setTitle op was present. */
  title?: string;
}

/** A single serialised queue so JSDOM global juggling in server-util never interleaves. */
class Serial {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(fn, fn);
    this.tail = next.catch(() => undefined);
    return next;
  }
}

export class BlockNoteBridge {
  /** Used for Y ↔ blocks ↔ markdown/html conversions. */
  private readonly converter = ServerBlockNoteEditor.create();
  /** Scratch editor used to apply ops; its state is throwaway between calls. */
  private readonly scratch = ServerBlockNoteEditor.create();
  private readonly serial = new Serial();

  emptyParagraph(): PartialBlockInput {
    return { id: randomUUID(), type: "paragraph", props: {}, content: [], children: [] };
  }

  /**
   * Y fragment → BlockNote block JSON. This intentionally does not use
   * ServerBlockNoteEditor.yXmlFragmentToBlocks: y-prosemirror deletes XML nodes
   * it cannot map to the editor schema. Persistence must be lossless because
   * the browser can know more block types than this service does.
   */
  fragmentToBlocks(fragment: Y.XmlFragment): Block[] {
    if (fragment.length === 0) return [];
    return blockGroupsToBlocks(fragment);
  }

  docToBlocks(doc: Y.Doc): Block[] {
    return this.fragmentToBlocks(doc.getXmlFragment(FRAGMENT_NAME));
  }

  readTitle(doc: Y.Doc): string {
    return doc.getText(TITLE_NAME).toString();
  }

  /** Replace the title text (no-op when unchanged). Must run inside a transaction of the caller's choosing. */
  writeTitle(doc: Y.Doc, title: string): boolean {
    const text = doc.getText(TITLE_NAME);
    if (text.toString() === title) return false;
    if (text.length > 0) text.delete(0, text.length);
    if (title.length > 0) text.insert(0, title);
    return true;
  }

  /**
   * Write `blocks` into the fragment using the structural diff (keeps identical blocks' Y items).
   * Passing an empty array writes a single empty paragraph — BlockNote documents are never empty.
   */
  writeBlocksToFragment(fragment: Y.XmlFragment, blocks: PartialBlockInput[]): void {
    const safe = blocks.length > 0 ? blocks : [this.emptyParagraph()];
    const pmDoc = _blocksToProsemirrorNode(this.converter.editor, safe as unknown as AnyPartialBlock[]);
    prosemirrorToYXmlFragment(pmDoc, fragment);
  }

  /** Initialise a brand-new document: one empty paragraph, empty title. */
  initEmptyDocument(doc: Y.Doc): void {
    doc.transact(() => {
      this.writeBlocksToFragment(doc.getXmlFragment(FRAGMENT_NAME), [this.emptyParagraph()]);
      doc.getText(TITLE_NAME); // materialise the root type
      doc.getMap(META_NAME);
    }, { source: "local", context: { source: "internal", init: true } });
  }

  /**
   * Apply a batch of ops to a live Y.Doc. The whole batch is validated on the scratch editor first;
   * only when every op succeeded is the result written back to Y (atomic from the clients' view).
   * Callers wrap this in `doc.transact` (e.g. via Hocuspocus' DirectConnection.transact).
   */
  applyOps(doc: Y.Doc, ops: DocOp[]): AppliedOps {
    if (!Array.isArray(ops)) throw new OpError(400, "ops must be an array");
    const fragment = doc.getXmlFragment(FRAGMENT_NAME);
    const editor = this.scratch.editor;

    const current = this.fragmentToBlocks(fragment);
    try {
      editor.replaceBlocks(editor.document, (current.length > 0 ? current : [this.emptyParagraph()]) as unknown as AnyPartialBlock[]);
    } catch (error) {
      // Do not let a server-side operation turn an unknown block into a deletion.
      // The document remains untouched; the browser can still render/edit it.
      throw new OpError(400, `document contains block types unsupported by server-side operations: ${errorMessage(error)}`);
    }

    let applied = 0;
    let title: string | undefined;
    let touchedBlocks = false;

    for (const [i, op] of ops.entries()) {
      if (!op || typeof op !== "object" || typeof (op as { op?: unknown }).op !== "string") {
        throw new OpError(400, `ops[${i}]: missing "op"`);
      }
      switch (op.op) {
        case "insert": {
          const blocks = requireBlocks(op.blocks, `ops[${i}].blocks`);
          const placement = op.placement ?? (op.referenceBlockId ? "after" : "end");
          const top = editor.document;
          if (op.referenceBlockId && placement !== "end") {
            requireBlock(editor, op.referenceBlockId, `ops[${i}].referenceBlockId`);
            editor.insertBlocks(blocks as unknown as AnyPartialBlock[], op.referenceBlockId, placement);
          } else if (placement === "before") {
            editor.insertBlocks(blocks as unknown as AnyPartialBlock[], top[0]!.id, "before");
          } else {
            // "end" (or "after" without a reference): append. If the document is just the single
            // empty paragraph every new page starts with, replace it instead of leaving a blank line.
            const last = top[top.length - 1]!;
            if (top.length === 1 && isEmptyParagraph(last)) {
              editor.replaceBlocks([last.id], blocks as unknown as AnyPartialBlock[]);
            } else {
              editor.insertBlocks(blocks as unknown as AnyPartialBlock[], last.id, "after");
            }
          }
          touchedBlocks = true;
          applied++;
          break;
        }
        case "update": {
          if (typeof op.blockId !== "string") throw new OpError(400, `ops[${i}].blockId is required`);
          if (!op.block || typeof op.block !== "object") throw new OpError(400, `ops[${i}].block is required`);
          requireBlock(editor, op.blockId, `ops[${i}].blockId`);
          editor.updateBlock(op.blockId, op.block as unknown as AnyPartialBlock);
          touchedBlocks = true;
          applied++;
          break;
        }
        case "remove": {
          if (!Array.isArray(op.blockIds) || op.blockIds.length === 0) {
            throw new OpError(400, `ops[${i}].blockIds must be a non-empty array`);
          }
          for (const id of op.blockIds) requireBlock(editor, id, `ops[${i}].blockIds`);
          const removing = new Set(op.blockIds);
          if (editor.document.every((b) => removing.has(b.id))) {
            // A BlockNote document is never empty: replace the last top-level blocks with a blank paragraph.
            editor.replaceBlocks(op.blockIds, [this.emptyParagraph() as unknown as AnyPartialBlock]);
          } else {
            editor.removeBlocks(op.blockIds);
          }
          touchedBlocks = true;
          applied++;
          break;
        }
        case "replace": {
          if (typeof op.blockId !== "string") throw new OpError(400, `ops[${i}].blockId is required`);
          const blocks = requireBlocks(op.blocks, `ops[${i}].blocks`);
          requireBlock(editor, op.blockId, `ops[${i}].blockId`);
          editor.replaceBlocks([op.blockId], blocks as unknown as AnyPartialBlock[]);
          touchedBlocks = true;
          applied++;
          break;
        }
        case "setTitle": {
          if (typeof op.title !== "string") throw new OpError(400, `ops[${i}].title must be a string`);
          title = op.title;
          applied++;
          break;
        }
        default:
          throw new OpError(400, `ops[${i}]: unknown op "${(op as { op: string }).op}"`);
      }
    }

    // Everything validated — now touch the shared document.
    if (touchedBlocks) prosemirrorToYXmlFragment(editor.prosemirrorState.doc, fragment);
    if (title !== undefined) this.writeTitle(doc, title);

    const result: AppliedOps = { applied };
    if (title !== undefined) result.title = title;
    return result;
  }

  /** Replace the whole document (title + blocks) — used by importers. */
  importDocument(doc: Y.Doc, title: string, blocks: PartialBlockInput[]): void {
    this.writeBlocksToFragment(doc.getXmlFragment(FRAGMENT_NAME), blocks);
    this.writeTitle(doc, title);
  }

  // ---- markdown / html -------------------------------------------------------------------

  markdownToBlocks(markdown: string): Promise<Block[]> {
    return this.serial.run(async () => (await this.converter.tryParseMarkdownToBlocks(markdown)) as unknown as Block[]);
  }

  blocksToMarkdown(blocks: PartialBlockInput[]): Promise<string> {
    return this.serial.run(() => this.converter.blocksToMarkdownLossy(blocks as unknown as AnyPartialBlock[]));
  }

  htmlToBlocks(html: string): Promise<Block[]> {
    return this.serial.run(async () => (await this.converter.tryParseHTMLToBlocks(html)) as unknown as Block[]);
  }

  /** `full` = BlockNote's own render markup (round-trips); `lossy` = simplified interoperable HTML. */
  blocksToHtml(blocks: PartialBlockInput[], mode: "full" | "lossy" = "full"): Promise<string> {
    return this.serial.run(() =>
      mode === "lossy"
        ? this.converter.blocksToHTMLLossy(blocks as unknown as AnyPartialBlock[])
        : this.converter.blocksToFullHTML(blocks as unknown as AnyPartialBlock[]),
    );
  }
}

// ---- lossless Yjs → Block JSON ---------------------------------------------------------

/** Defaults needed when a client-created Y node omitted default-valued attrs. */
const DEFAULT_PROPS: Record<string, Record<string, unknown>> = {
  audio: { backgroundColor: "default", name: "", url: "", caption: "", showPreview: true },
  bulletListItem: { backgroundColor: "default", textColor: "default", textAlignment: "left" },
  checkListItem: { backgroundColor: "default", textColor: "default", textAlignment: "left", checked: false },
  codeBlock: { language: "text" },
  file: { backgroundColor: "default", name: "", url: "", caption: "" },
  heading: { backgroundColor: "default", textColor: "default", textAlignment: "left", level: 1, isToggleable: false },
  image: { textAlignment: "left", backgroundColor: "default", name: "", url: "", caption: "", showPreview: true },
  numberedListItem: { backgroundColor: "default", textColor: "default", textAlignment: "left" },
  paragraph: { backgroundColor: "default", textColor: "default", textAlignment: "left" },
  quote: { backgroundColor: "default", textColor: "default" },
  table: { textColor: "default" },
  toggleListItem: { backgroundColor: "default", textColor: "default", textAlignment: "left" },
  video: { textAlignment: "left", backgroundColor: "default", name: "", url: "", caption: "", showPreview: true },
};

const INLINE_BLOCK_TYPES = new Set([
  "bulletListItem",
  "checkListItem",
  "codeBlock",
  "heading",
  "numberedListItem",
  "paragraph",
  "quote",
  "toggleListItem",
  // Nook's shipped custom blocks. Unknown blocks are inferred from their XML content.
  "callout",
  "equation",
  "htmlBlock",
  "mermaid",
]);

function blockGroupsToBlocks(root: Y.XmlFragment | Y.XmlElement): Block[] {
  return root
    .toArray()
    .filter(isXmlElement)
    .flatMap((child) => {
      if (child.nodeName === "blockGroup") return blockGroupsToBlocks(child);
      return hasBlockId(child) ? [xmlBlockToJson(child)] : [];
    });
}

function nestedBlocks(root: Y.XmlElement): Block[] {
  return root
    .toArray()
    .filter(isXmlElement)
    .flatMap((child) => {
      if (child.nodeName === "blockGroup") return blockGroupsToBlocks(child);
      return hasBlockId(child) ? [xmlBlockToJson(child)] : [];
    });
}

function xmlBlockToJson(node: Y.XmlElement): Block {
  const attrs = cloneAttributes(node.getAttributes());
  const id = typeof attrs.id === "string" && attrs.id.length > 0 ? attrs.id : randomUUID();
  delete attrs.id;

  if (node.nodeName === "blockContainer") {
    const elements = node.toArray().filter(isXmlElement);
    const contentNode = elements.find((child) => child.nodeName !== "blockGroup");
    const type = contentNode?.nodeName ?? "paragraph";
    const props = { ...(DEFAULT_PROPS[type] ?? {}), ...(contentNode ? cloneAttributes(contentNode.getAttributes()) : attrs) };
    return {
      id,
      type,
      props,
      ...(contentNode ? { content: xmlBlockContent(contentNode, type) } : { content: [] }),
      children: nestedBlocks(node),
    };
  }

  return {
    id,
    type: node.nodeName,
    props: attrs,
    ...(hasInlineContent(node) ? { content: xmlBlockContent(node, node.nodeName) } : {}),
    children: nestedBlocks(node),
  };
}

function xmlBlockContent(node: Y.XmlElement, type: string): unknown {
  if (type === "table") return tableContent(node);
  if (!INLINE_BLOCK_TYPES.has(type) && !hasInlineContent(node)) return undefined;
  return inlineContent(node);
}

function hasInlineContent(node: Y.XmlElement): boolean {
  return node.toArray().some((child) => child instanceof Y.XmlText || (child instanceof Y.XmlElement && child.nodeName !== "blockGroup"));
}

function inlineContent(node: Y.XmlElement): unknown[] {
  const content: unknown[] = [];
  for (const child of node.toArray()) {
    if (child instanceof Y.XmlText) {
      for (const delta of child.toDelta()) {
        if (typeof delta.insert !== "string" || delta.insert.length === 0) continue;
        const attributes = (delta.attributes ?? {}) as Record<string, unknown>;
        const link = attributes.link;
        const text = { type: "text", text: delta.insert, styles: inlineStyles(attributes) };
        if (link && typeof link === "object" && typeof (link as { href?: unknown }).href === "string") {
          content.push({ type: "link", href: (link as { href: string }).href, content: [text] });
        } else {
          content.push(text);
        }
      }
      continue;
    }
    if (!(child instanceof Y.XmlElement)) continue;
    if (child.nodeName === "hardBreak") {
      content.push({ type: "text", text: "\n", styles: {} });
      continue;
    }
    content.push(xmlInlineToJson(child));
  }
  return content;
}

function xmlInlineToJson(node: Y.XmlElement): Record<string, unknown> {
  const result: Record<string, unknown> = { type: node.nodeName, props: cloneAttributes(node.getAttributes()) };
  const children = inlineContent(node);
  if (children.length > 0) {
    const onlyText = children.every(
      (item) => item && typeof item === "object" && (item as { type?: unknown }).type === "text",
    );
    result.content = onlyText ? children.map((item) => (item as { text: string }).text).join("") : children;
  }
  return result;
}

function tableContent(table: Y.XmlElement): Record<string, unknown> {
  const rows = table.toArray().filter(isXmlElement).filter((row) => row.nodeName === "tableRow");
  const headerMatrix: boolean[][] = [];
  const columnWidths: unknown[] = [];
  const jsonRows = rows.map((row, rowIndex) => {
    const cells = row.toArray().filter(isXmlElement).filter((cell) => cell.nodeName === "tableCell" || cell.nodeName === "tableHeader");
    headerMatrix[rowIndex] = cells.map((cell) => cell.nodeName === "tableHeader");
    return {
      cells: cells.map((cell, cellIndex) => {
        const attrs = cloneAttributes(cell.getAttributes());
        const width = attrs.colwidth;
        if (rowIndex === 0) columnWidths.push(Array.isArray(width) ? width[0] : width ?? undefined);
        delete attrs.colwidth;
        const paragraph = cell.toArray().filter(isXmlElement).find((child) => child.nodeName === "tableParagraph");
        return { type: "tableCell", content: paragraph ? inlineContent(paragraph) : [], props: attrs };
      }),
    };
  });
  const headerRows = headerMatrix.filter((row) => row.length > 0 && row.every(Boolean)).length;
  const width = headerMatrix[0]?.length ?? 0;
  const headerCols = width === 0 ? 0 : Array.from({ length: width }, (_, i) => headerMatrix.every((row) => row[i])).filter(Boolean).length;
  return { type: "tableContent", columnWidths, headerRows, headerCols, rows: jsonRows };
}

function inlineStyles(attributes: Record<string, unknown>): Record<string, unknown> {
  const styles: Record<string, unknown> = {};
  for (const [rawName, value] of Object.entries(attributes)) {
    const name = rawName.replace(/--[a-zA-Z0-9+/=]{8}$/, "");
    if (name === "link") continue;
    if (value && typeof value === "object" && "stringValue" in value) {
      styles[name] = (value as { stringValue: unknown }).stringValue;
    } else {
      styles[name] = true;
    }
  }
  return styles;
}

function isXmlElement(value: Y.XmlElement | Y.XmlText | Y.XmlHook): value is Y.XmlElement {
  return value instanceof Y.XmlElement;
}

function hasBlockId(node: Y.XmlElement): boolean {
  return typeof node.getAttribute("id") === "string" && String(node.getAttribute("id")).length > 0;
}

function cloneAttributes(attributes: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(attributes).map(([key, value]) => [key, cloneJsonValue(value)]));
}

function cloneJsonValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(cloneJsonValue);
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, cloneJsonValue(item)]));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function requireBlocks(blocks: unknown, where: string): PartialBlockInput[] {
  if (!Array.isArray(blocks) || blocks.length === 0) throw new OpError(400, `${where} must be a non-empty array`);
  for (const [i, b] of blocks.entries()) {
    if (!b || typeof b !== "object" || typeof (b as { type?: unknown }).type !== "string") {
      throw new OpError(400, `${where}[${i}] must be a block with a "type"`);
    }
  }
  return blocks as PartialBlockInput[];
}

function requireBlock(editor: ServerBlockNoteEditor["editor"], id: string, where: string): void {
  if (typeof id !== "string" || !editor.getBlock(id)) throw new OpError(404, `${where}: block "${id}" not found`);
}

function isEmptyParagraph(block: Block): boolean {
  return (
    block.type === "paragraph" &&
    (block.children?.length ?? 0) === 0 &&
    (!Array.isArray(block.content) || block.content.length === 0)
  );
}

/** base64 helpers for the ydoc field of the backend API. */
export function encodeDoc(doc: Y.Doc): string {
  return Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64");
}

export function applyEncodedDoc(doc: Y.Doc, base64: string, origin?: unknown): void {
  Y.applyUpdate(doc, new Uint8Array(Buffer.from(base64, "base64")), origin);
}
