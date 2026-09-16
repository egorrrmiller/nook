import { isEmbeddableUrl, parseHttpUrl } from '../schema/providers';

export type PasteClassification =
  | { kind: 'text' }
  | { kind: 'markdown' }
  | {
      kind: 'url';
      url: string;
      /** Set when the URL points at a page of this workspace (`/w/{ws}/p/{nodeId}[#b-<blockId>]`). */
      internal?: { nodeId: string; blockId?: string; page?: number };
      embeddable: boolean;
      /** Direct link to an image / video / audio / pdf file, by extension. */
      media?: 'image' | 'video' | 'audio' | 'pdf';
    };

export interface ClassifyContext {
  /** `window.location.origin`; internal links must match it (or be app-relative). */
  origin?: string;
  workspaceId?: string;
}

const MEDIA_EXT: Record<
  string,
  NonNullable<Extract<PasteClassification, { kind: 'url' }>['media']>
> = {
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  avif: 'image',
  svg: 'image',
  mp4: 'video',
  webm: 'video',
  mov: 'video',
  mp3: 'audio',
  wav: 'audio',
  ogg: 'audio',
  m4a: 'audio',
  pdf: 'pdf',
};

/** `/w/{ws}/p/{nodeId}#b-{blockId}` → ids, or null. */
export function parseInternalPageUrl(
  raw: string,
  ctx: ClassifyContext = {},
): { workspaceId: string; nodeId: string; blockId?: string; page?: number } | null {
  let path: string;
  let hash = '';
  if (raw.startsWith('/')) {
    const i = raw.indexOf('#');
    path = i >= 0 ? raw.slice(0, i) : raw;
    hash = i >= 0 ? raw.slice(i + 1) : '';
  } else {
    const u = parseHttpUrl(raw);
    if (!u) return null;
    if (ctx.origin && u.origin !== ctx.origin) return null;
    path = u.pathname;
    hash = u.hash.replace(/^#/, '');
  }
  const m = /^\/w\/([^/]+)\/p\/([^/?#]+)\/?$/.exec(path);
  if (!m) return null;
  const blockId = /^b-(.+)$/.exec(hash)?.[1];
  const rawPage = /^page=(\d+)$/.exec(hash)?.[1];
  const page = rawPage ? Number.parseInt(rawPage, 10) : undefined;
  return {
    workspaceId: m[1]!,
    nodeId: m[2]!,
    ...(blockId ? { blockId } : {}),
    ...(page ? { page } : {}),
  };
}

const MD_HINTS = [
  /^#{1,6}\s+\S/m, // headings
  /^\s*[-*+]\s+\S/m, // bullet lists
  /^\s*\d+\.\s+\S/m, // numbered lists
  /^\s*[-*+]\s+\[[ xX]\]\s/m, // checklists
  /^>\s?\S/m, // quotes
  /```/, // fences
  /\*\*[^*\n]+\*\*/, // bold
  /\[[^\]\n]+\]\([^)\n]+\)/, // links
  /^\|.+\|\s*$/m, // tables
  /^(?:---|\*\*\*)\s*$/m, // rules
];

/** Cheap heuristic mirroring BlockNote's `isMarkdown`, exported for the paste tests. */
export function looksLikeMarkdown(text: string): boolean {
  let hits = 0;
  for (const re of MD_HINTS) if (re.test(text)) hits++;
  return hits >= 1 && text.includes('\n') ? true : hits >= 2;
}

/**
 * Decides what a plain-text paste should become. A single bare URL (one line, no other text)
 * triggers the Notion-style "Bookmark / Embed / Mention / Plain link" popover; anything with
 * markdown syntax becomes blocks; the rest is plain text.
 */
export function classifyPastedText(text: string, ctx: ClassifyContext = {}): PasteClassification {
  const trimmed = text.trim();
  if (!trimmed) return { kind: 'text' };
  if (!/\s/.test(trimmed)) {
    const internal = parseInternalPageUrl(trimmed, ctx);
    if (internal && (!ctx.workspaceId || internal.workspaceId === ctx.workspaceId)) {
      return {
        kind: 'url',
        url: trimmed,
        internal: {
          nodeId: internal.nodeId,
          ...(internal.blockId ? { blockId: internal.blockId } : {}),
          ...(internal.page ? { page: internal.page } : {}),
        },
        embeddable: false,
      };
    }
    const u = parseHttpUrl(trimmed);
    if (u) {
      const ext = /\.([a-z0-9]{2,5})$/i.exec(u.pathname)?.[1]?.toLowerCase();
      const media = ext ? MEDIA_EXT[ext] : undefined;
      return {
        kind: 'url',
        url: trimmed,
        embeddable: isEmbeddableUrl(trimmed),
        ...(media ? { media } : {}),
      };
    }
  }
  if (looksLikeMarkdown(trimmed)) return { kind: 'markdown' };
  return { kind: 'text' };
}
