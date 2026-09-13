// Block-level diff between two page snapshots (contracts §9.7: "Diffs are computed client-side
// from two versions"). Blocks are matched by their stable ids from the `blocks` projection; an
// LCS over those ids gives added / removed / moved-free alignment, and matched pairs are compared
// by type, props and text. Changed text additionally gets a word-level LCS diff.
import type { Block } from '@nook/api-client';
import { blockText, type LooseBlock } from '@nook/editor';

export type DiffOp = 'added' | 'removed' | 'changed' | 'unchanged';

export interface TextSegment {
  op: 'equal' | 'insert' | 'delete';
  text: string;
}

export interface BlockDiffEntry {
  op: DiffOp;
  /** Id of the block (the "after" id for added/changed, the "before" id for removed). */
  id: string;
  type: string;
  depth: number;
  before?: Block;
  after?: Block;
  text: { before: string; after: string };
  /** Word-level diff, only for `changed` entries whose text differs. */
  segments?: TextSegment[];
  /** True when only props changed (colour, checked, language…). */
  propsOnly?: boolean;
}

export interface DiffSummary {
  added: number;
  removed: number;
  changed: number;
  unchanged: number;
}

interface FlatBlock {
  block: Block;
  depth: number;
}

export function flattenBlocks(blocks: Block[], depth = 0, out: FlatBlock[] = []): FlatBlock[] {
  for (const b of blocks) {
    out.push({ block: b, depth });
    if (b.children?.length) flattenBlocks(b.children, depth + 1, out);
  }
  return out;
}

/** Longest common subsequence of two key arrays; returns pairs of matched indices. */
export function lcsPairs<T>(a: T[], b: T[], eq: (x: T, y: T) => boolean = (x, y) => x === y): [number, number][] {
  const n = a.length;
  const m = b.length;
  // table[i][j] = LCS length of a[i..], b[j..]
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i]![j] = eq(a[i]!, b[j]!) ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }
  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (eq(a[i]!, b[j]!)) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) i++;
    else j++;
  }
  return pairs;
}

const WORD_RE = /(\s+)/;

/** Word-level text diff (LCS over whitespace-separated tokens), merged into runs. */
export function diffWords(before: string, after: string): TextSegment[] {
  if (before === after) return before ? [{ op: 'equal', text: before }] : [];
  const a = before.split(WORD_RE).filter((t) => t !== '');
  const b = after.split(WORD_RE).filter((t) => t !== '');
  const pairs = lcsPairs(a, b);
  const segments: TextSegment[] = [];
  const push = (op: TextSegment['op'], text: string) => {
    if (!text) return;
    const last = segments[segments.length - 1];
    if (last && last.op === op) last.text += text;
    else segments.push({ op, text });
  };
  let ai = 0;
  let bi = 0;
  for (const [pa, pb] of pairs) {
    while (ai < pa) push('delete', a[ai++]!);
    while (bi < pb) push('insert', b[bi++]!);
    push('equal', a[pa]!);
    ai = pa + 1;
    bi = pb + 1;
  }
  while (ai < a.length) push('delete', a[ai++]!);
  while (bi < b.length) push('insert', b[bi++]!);
  return segments;
}

function propsEqual(a: Block, b: Block): boolean {
  const ka = Object.keys(a.props ?? {});
  const kb = Object.keys(b.props ?? {});
  if (ka.length !== kb.length) return false;
  return ka.every((k) => JSON.stringify(a.props[k]) === JSON.stringify(b.props[k]));
}

/** Block-level diff of two snapshots, in the order of the newer document. */
export function diffBlocks(before: Block[], after: Block[]): BlockDiffEntry[] {
  const a = flattenBlocks(before);
  const b = flattenBlocks(after);
  const pairs = lcsPairs(
    a.map((x) => x.block.id),
    b.map((x) => x.block.id),
  );
  const matched = new Map<number, number>(pairs.map(([i, j]) => [j, i]));
  const consumed = new Set<number>(pairs.map(([i]) => i));
  const entries: BlockDiffEntry[] = [];

  let ai = 0;
  for (let bi = 0; bi < b.length; bi++) {
    const target = matched.get(bi);
    if (target !== undefined) {
      // Everything before the matched "before" block was removed.
      while (ai < target) {
        if (!consumed.has(ai)) {
          const removed = a[ai]!;
          entries.push({
            op: 'removed',
            id: removed.block.id,
            type: removed.block.type,
            depth: removed.depth,
            before: removed.block,
            text: { before: blockText(removed.block as unknown as LooseBlock), after: '' },
          });
        }
        ai++;
      }
      ai = target + 1;
      const bef = a[target]!.block;
      const aft = b[bi]!.block;
      const textBefore = blockText(bef as unknown as LooseBlock);
      const textAfter = blockText(aft as unknown as LooseBlock);
      const sameType = bef.type === aft.type;
      const sameProps = propsEqual(bef, aft);
      const sameText = textBefore === textAfter;
      const sameDepth = a[target]!.depth === b[bi]!.depth;
      if (sameType && sameProps && sameText && sameDepth) {
        entries.push({
          op: 'unchanged',
          id: aft.id,
          type: aft.type,
          depth: b[bi]!.depth,
          before: bef,
          after: aft,
          text: { before: textBefore, after: textAfter },
        });
      } else {
        entries.push({
          op: 'changed',
          id: aft.id,
          type: aft.type,
          depth: b[bi]!.depth,
          before: bef,
          after: aft,
          text: { before: textBefore, after: textAfter },
          ...(sameText ? { propsOnly: true } : { segments: diffWords(textBefore, textAfter) }),
        });
      }
    } else {
      const added = b[bi]!;
      entries.push({
        op: 'added',
        id: added.block.id,
        type: added.block.type,
        depth: added.depth,
        after: added.block,
        text: { before: '', after: blockText(added.block as unknown as LooseBlock) },
      });
    }
  }
  // Anything left in the old document was removed at the end.
  while (ai < a.length) {
    if (!consumed.has(ai)) {
      const removed = a[ai]!;
      entries.push({
        op: 'removed',
        id: removed.block.id,
        type: removed.block.type,
        depth: removed.depth,
        before: removed.block,
        text: { before: blockText(removed.block as unknown as LooseBlock), after: '' },
      });
    }
    ai++;
  }
  return entries;
}

export function summarise(entries: BlockDiffEntry[]): DiffSummary {
  const s: DiffSummary = { added: 0, removed: 0, changed: 0, unchanged: 0 };
  for (const e of entries) s[e.op]++;
  return s;
}

/** Drops runs of unchanged blocks longer than `context`, like a unified diff. */
export function collapseUnchanged(entries: BlockDiffEntry[], context = 1): (BlockDiffEntry | { op: 'gap'; count: number })[] {
  const out: (BlockDiffEntry | { op: 'gap'; count: number })[] = [];
  let run: BlockDiffEntry[] = [];
  const flush = (atEnd: boolean) => {
    if (!run.length) return;
    const head = out.length === 0 ? 0 : context;
    const tail = atEnd ? 0 : context;
    if (run.length <= head + tail) out.push(...run);
    else {
      out.push(...run.slice(0, head));
      out.push({ op: 'gap', count: run.length - head - tail });
      if (tail) out.push(...run.slice(run.length - tail));
    }
    run = [];
  };
  for (const e of entries) {
    if (e.op === 'unchanged') run.push(e);
    else {
      flush(false);
      out.push(e);
    }
  }
  flush(true);
  return out;
}
