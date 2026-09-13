import type { AnyEditor } from '../types';

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `b-${Math.random().toString(36).slice(2)}`;
}

/** Deep-copies a block tree with fresh ids (block ids are globally unique in the `blocks` projection). */
export function cloneBlockWithNewIds<T extends { id: string; children?: T[] }>(block: T): T {
  return {
    ...block,
    id: newId(),
    children: (block.children ?? []).map((c) => cloneBlockWithNewIds(c)),
  };
}

/** ⌘D — duplicates the given blocks (or the cursor's block) right below the last one. */
export function duplicateBlocks(editor: AnyEditor, ids?: string[]): string[] {
  const targets = ids?.length ? ids : [editor.getTextCursorPosition().block.id];
  const blocks = targets.map((id) => editor.getBlock(id)).filter(Boolean);
  if (!blocks.length) return [];
  const copies = blocks.map((b) => cloneBlockWithNewIds(b as never));
  const inserted = editor.insertBlocks(copies as never, targets[targets.length - 1]!, 'after');
  return inserted.map((b) => b.id);
}

export function deleteBlocks(editor: AnyEditor, ids?: string[]): void {
  const targets = ids?.length ? ids : [editor.getTextCursorPosition().block.id];
  editor.removeBlocks(targets);
}

/** The ids the block-level commands act on: the multi-block selection, else the cursor's block. */
export function selectedBlockIds(editor: AnyEditor): string[] {
  const sel = editor.getSelection()?.blocks;
  if (sel && sel.length) return sel.map((b) => b.id);
  return [editor.getTextCursorPosition().block.id];
}
