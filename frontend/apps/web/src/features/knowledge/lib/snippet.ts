/**
 * Search snippets arrive as `ts_headline` output: plain text with `<mark>…</mark>` around the
 * matches (contracts §9.5). Nothing else may be rendered as HTML, so we tokenise the string
 * ourselves instead of using `dangerouslySetInnerHTML`.
 */
export interface SnippetPart {
  text: string;
  mark: boolean;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'",
  nbsp: ' ',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, code: string) => {
    const lower = code.toLowerCase();
    if (lower in ENTITIES) return ENTITIES[lower]!;
    if (lower.startsWith('#x')) return String.fromCodePoint(parseInt(lower.slice(2), 16));
    if (lower.startsWith('#')) return String.fromCodePoint(parseInt(lower.slice(1), 10));
    return m;
  });
}

/** Splits a snippet into marked / unmarked runs; every tag other than `<mark>` is stripped. */
export function parseSnippet(snippet: string): SnippetPart[] {
  const parts: SnippetPart[] = [];
  const re = /<\/?([a-z][a-z0-9-]*)(?:\s[^<>]*)?>/gi;
  let depth = 0;
  let last = 0;
  const push = (text: string) => {
    if (!text) return;
    const decoded = decodeEntities(text);
    const mark = depth > 0;
    const prev = parts[parts.length - 1];
    if (prev && prev.mark === mark) prev.text += decoded;
    else parts.push({ text: decoded, mark });
  };
  for (let m = re.exec(snippet); m; m = re.exec(snippet)) {
    push(snippet.slice(last, m.index));
    last = m.index + m[0].length;
    const tag = m[1]!.toLowerCase();
    if (tag === 'mark') {
      if (m[0].startsWith('</')) depth = Math.max(0, depth - 1);
      else depth += 1;
    }
    // any other tag is dropped silently
  }
  push(snippet.slice(last));
  return parts;
}

/** Plain-text version of a snippet (marks removed) — used for titles/tooltips. */
export function snippetText(snippet: string): string {
  return parseSnippet(snippet)
    .map((p) => p.text)
    .join('');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Highlights every case-insensitive occurrence of `terms` inside plain `text`
 * (backlink snippets are plain text; we mark the current page's title/aliases).
 */
export function highlightTerms(text: string, terms: string[]): SnippetPart[] {
  const clean = terms.map((t) => t.trim()).filter((t) => t.length > 0);
  if (!clean.length || !text) return [{ text, mark: false }];
  const re = new RegExp(clean.map(escapeRegExp).join('|'), 'gi');
  const parts: SnippetPart[] = [];
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), mark: false });
    parts.push({ text: m[0], mark: true });
    last = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex++;
  }
  if (last < text.length) parts.push({ text: text.slice(last), mark: false });
  return parts;
}
