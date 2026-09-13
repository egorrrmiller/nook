import type { Node, NodeIcon } from '@nook/api-client';
import { toast } from '../stores/toast';

export function isMac(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
}

export function modKey(): string {
  return isMac() ? '⌘' : 'Ctrl';
}

export function nodeTitle(title: string | null | undefined): string {
  return title && title.trim().length ? title : 'Untitled';
}

/** Emoji glyph of an icon, or null for image icons / no icon (for tab strips and compact rows). */
export function emojiOf(icon: NodeIcon | null | undefined): string | null {
  return icon?.type === 'emoji' ? icon.value : null;
}

export function pageHref(workspaceId: string, nodeId: string): string {
  return `/w/${workspaceId}/p/${nodeId}`;
}

export function pageUrl(workspaceId: string, nodeId: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}${pageHref(workspaceId, nodeId)}`;
}

export async function copyText(text: string, message = 'Copied to clipboard'): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast(message);
  } catch {
    toast('Could not copy to clipboard', 'error');
  }
}

export function copyPageLink(node: Pick<Node, 'id' | 'workspaceId'>): Promise<void> {
  return copyText(pageUrl(node.workspaceId, node.id), 'Link copied');
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}
