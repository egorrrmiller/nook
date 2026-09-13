import { blockText, type LooseBlock } from '../util/text';

export interface TocEntry {
  id: string;
  level: number;
  text: string;
}

/**
 * Collects headings from a block tree in document order (nested blocks included — toggles and
 * columns can hold headings). Empty headings are skipped, like Notion's table of contents.
 */
export function extractHeadings(blocks: LooseBlock[], maxLevel = 4): TocEntry[] {
  const out: TocEntry[] = [];
  const walk = (list: LooseBlock[]) => {
    for (const b of list) {
      if (b.type === 'heading') {
        const level = Number(b.props.level ?? 1);
        const text = blockText(b).trim();
        if (text && level <= maxLevel) out.push({ id: b.id, level, text });
      }
      if (b.children?.length) walk(b.children);
    }
  };
  walk(blocks);
  return out;
}

/** Indentation depth relative to the shallowest heading present (H2-only docs start at 0). */
export function tocDepths(entries: TocEntry[]): number[] {
  if (entries.length === 0) return [];
  const min = Math.min(...entries.map((e) => e.level));
  return entries.map((e) => e.level - min);
}
