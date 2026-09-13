import { useEffect } from 'react';
import type { AnyEditor } from '../types';

export const ANCHOR_PREFIX = '#b-';
const HIGHLIGHT_CLASS = 'nook-block-highlight';
const HIGHLIGHT_MS = 2200;
const STYLE_ID = 'nook-anchor-highlight';

/** `#b-<blockId>` → blockId, or null. */
export function blockIdFromHash(hash: string): string | null {
  return hash.startsWith(ANCHOR_PREFIX) && hash.length > ANCHOR_PREFIX.length
    ? decodeURIComponent(hash.slice(ANCHOR_PREFIX.length))
    : null;
}

/** Escapes a value for use inside a quoted CSS attribute selector. */
function escapeCss(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}

export function findBlockElement(editor: AnyEditor, blockId: string): HTMLElement | null {
  // `editor.domElement` can point at a detached ProseMirror root after a re-mount (React
  // StrictMode, node-view re-creation), so fall back to the live document.
  const own = editor.domElement;
  const root: ParentNode = own?.isConnected ? own : document;
  const esc = escapeCss(blockId);
  return root.querySelector<HTMLElement>(`.bn-block-outer[data-id="${esc}"]`) ?? root.querySelector<HTMLElement>(`[data-id="${esc}"]`);
}

/**
 * Flashes a block. ProseMirror re-creates node-view DOM freely (the element the class was put on
 * can be detached moments later), so the highlight is driven by an injected CSS rule keyed on
 * `data-id` and the class is re-applied while the flash lasts.
 */
export function highlightBlock(editor: AnyEditor, blockId: string): void {
  const esc = escapeCss(blockId);
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = `.bn-block-outer[data-id="${esc}"]{animation:nook-block-flash ${HIGHLIGHT_MS}ms ease-out;border-radius:var(--radius-sm);}`;

  // ProseMirror rewrites the class attribute of its block wrappers on re-render, so the class is
  // only a convenience for app CSS — the CSS rule above is what actually drives the flash.
  const apply = () => findBlockElement(editor, blockId)?.classList.add(HIGHLIGHT_CLASS);
  apply();
  const interval = window.setInterval(apply, 150);
  window.setTimeout(() => {
    window.clearInterval(interval);
    findBlockElement(editor, blockId)?.classList.remove(HIGHLIGHT_CLASS);
    document.getElementById(STYLE_ID)?.remove();
  }, HIGHLIGHT_MS);
}

/** Scrolls a block into view and flashes it. Returns false when the block is not rendered (yet). */
export function scrollToBlock(editor: AnyEditor, blockId: string, highlight = true): boolean {
  const el = findBlockElement(editor, blockId);
  if (!el) return false;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (highlight) highlightBlock(editor, blockId);
  return true;
}

/**
 * Honours `#b-<blockId>` in the URL: on mount, on hash changes and once the document has
 * synced (the block may arrive late over the collab connection). Retries a few times.
 */
export function useBlockAnchor(editor: AnyEditor | null, ready: boolean): void {
  useEffect(() => {
    if (!editor || !ready) return;
    let cancelled = false;
    let timer: number | undefined;

    const attempt = (id: string, tries: number) => {
      if (cancelled) return;
      if (scrollToBlock(editor, id)) return;
      if (tries > 0) timer = window.setTimeout(() => attempt(id, tries - 1), 250);
    };
    const run = () => {
      const id = blockIdFromHash(window.location.hash);
      if (id) attempt(id, 20);
    };
    run();
    window.addEventListener('hashchange', run);
    return () => {
      cancelled = true;
      window.removeEventListener('hashchange', run);
      if (timer) window.clearTimeout(timer);
    };
  }, [editor, ready]);
}

/** Absolute URL for a block anchor, written to the clipboard by "Copy link to block". */
export function blockLinkUrl(pageHref: string, blockId: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}${pageHref}${ANCHOR_PREFIX}${blockId}`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
