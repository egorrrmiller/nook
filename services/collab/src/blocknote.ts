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

// The default BlockNote schema; custom plugin block types would need to be registered here too.
// Incoming block JSON is deliberately loosely typed (contracts §4), hence the `as unknown as` casts.
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

  /** Y fragment → BlockNote block JSON. An empty fragment yields []. */
  fragmentToBlocks(fragment: Y.XmlFragment): Block[] {
    if (fragment.length === 0) return [];
    return this.converter.yXmlFragmentToBlocks(fragment) as unknown as Block[];
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
    editor.replaceBlocks(editor.document, (current.length > 0 ? current : [this.emptyParagraph()]) as unknown as AnyPartialBlock[]);

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
