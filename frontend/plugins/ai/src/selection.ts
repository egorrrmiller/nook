import type { AiBlock } from './types';

/** Walks the document in the same order users see it, including nested blocks. */
export function flattenBlocks(blocks: readonly AiBlock[]): AiBlock[] {
  const result: AiBlock[] = [];
  const visit = (block: AiBlock) => {
    result.push(block);
    for (const child of block.children ?? []) visit(child);
  };
  for (const block of blocks) visit(block);
  return result;
}

/** Returns deep-cloned selected blocks in document order, preserving every unknown JSON key. */
export function selectBlocks(document: readonly AiBlock[], selectedIds: readonly string[]): AiBlock[] {
  const ids = new Set(selectedIds);
  if (ids.size !== selectedIds.length) throw new Error('A block can be selected only once.');
  const selected = flattenBlocks(document)
    .filter((block) => ids.has(block.id))
    .map(cloneBlock);
  const found = new Set(selected.map((block) => block.id));
  const missing = selectedIds.filter((id) => !found.has(id));
  if (missing.length) throw new Error(`Selected block was not found: ${missing.join(', ')}`);
  return selected;
}

/** BlockNote content can be inline arrays, table-like nested objects, or a plugin-defined shape. */
export function blockText(block: AiBlock): string {
  const parts: string[] = [];
  collectText(block.content, parts);
  if (parts.length === 0 && typeof block.props?.text === 'string') parts.push(block.props.text);
  if (parts.length === 0 && typeof block.props?.caption === 'string') parts.push(block.props.caption);
  return parts.join('\n').trim();
}

export function cloneBlock<T extends AiBlock>(block: T): T {
  return JSON.parse(JSON.stringify(block)) as T;
}

function collectText(value: unknown, into: string[]): void {
  if (typeof value === 'string') {
    into.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectText(item, into);
    return;
  }
  if (!value || typeof value !== 'object') return;
  const object = value as Record<string, unknown>;
  if (object.type === 'text' && typeof object.text === 'string') {
    into.push(object.text);
    return;
  }
  if ('content' in object) collectText(object.content, into);
  else if (typeof object.text === 'string') into.push(object.text);
  else if ('rows' in object) collectText(object.rows, into);
  else if ('cells' in object) collectText(object.cells, into);
}
