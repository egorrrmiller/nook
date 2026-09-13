/**
 * Schema-agnostic text helpers over the §4 block JSON shape. Kept free of BlockNote imports so
 * they can run in Node (unit tests, history diff).
 */
export interface LooseBlock {
  id: string;
  type: string;
  props: Record<string, unknown>;
  content?: unknown;
  children: LooseBlock[];
}

function inlineText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  let out = '';
  for (const item of content) {
    if (!item || typeof item !== 'object') continue;
    const ic = item as { type?: string; text?: string; content?: unknown; props?: Record<string, unknown> };
    if (ic.type === 'text' && typeof ic.text === 'string') out += ic.text;
    else if (ic.type === 'link') out += inlineText(ic.content);
    else if (ic.props && typeof ic.props.title === 'string') out += ic.props.title;
    else if (ic.props && typeof ic.props.date === 'string') out += ic.props.date;
    else if (typeof ic.content === 'string') out += ic.content;
    else if (Array.isArray(ic.content)) out += inlineText(ic.content);
  }
  return out;
}

/** Text of a single block, not including its children. */
export function blockText(block: LooseBlock): string {
  const c = block.content as { type?: string; rows?: { cells: unknown[] }[] } | undefined;
  if (c && typeof c === 'object' && !Array.isArray(c) && c.type === 'tableContent') {
    return (c.rows ?? [])
      .map((r) =>
        r.cells
          .map((cell) => {
            const tc = cell as { type?: string; content?: unknown };
            return tc && typeof tc === 'object' && tc.type === 'tableCell' ? inlineText(tc.content) : inlineText(cell);
          })
          .join(' '),
      )
      .join('\n');
  }
  if (typeof block.content === 'string') return block.content;
  if (Array.isArray(block.content)) return inlineText(block.content);
  // Media / custom blocks expose their searchable text through well-known props.
  const p = block.props;
  const parts = [p.title, p.caption, p.name, p.description].filter((x) => typeof x === 'string' && x) as string[];
  return parts.join(' ');
}

/** Text of a block tree, blocks separated by newlines. */
export function documentText(blocks: LooseBlock[]): string {
  const out: string[] = [];
  const walk = (list: LooseBlock[]) => {
    for (const b of list) {
      const t = blockText(b);
      if (t) out.push(t);
      if (b.children?.length) walk(b.children);
    }
  };
  walk(blocks);
  return out.join('\n');
}

export interface TextStats {
  words: number;
  characters: number;
  charactersNoSpaces: number;
  blocks: number;
}

export function countBlocks(blocks: LooseBlock[]): number {
  let n = 0;
  const walk = (list: LooseBlock[]) => {
    for (const b of list) {
      n++;
      if (b.children?.length) walk(b.children);
    }
  };
  walk(blocks);
  return n;
}

export function textStats(blocks: LooseBlock[]): TextStats {
  const text = documentText(blocks);
  const words = text.trim() ? text.trim().split(/\s+/u).length : 0;
  return {
    words,
    characters: Array.from(text.replace(/\n/g, '')).length,
    charactersNoSpaces: Array.from(text.replace(/\s/gu, '')).length,
    blocks: countBlocks(blocks),
  };
}

/** Plain source of a `content: "plain"` block (BlockNote stores it as a string or one text run). */
export function plainSource(content: unknown): string {
  if (typeof content === 'string') return content;
  return inlineText(content);
}
