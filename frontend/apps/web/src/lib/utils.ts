export function isMac(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
}

export function modKey(): string {
  return isMac() ? '⌘' : 'Ctrl';
}

export function nodeTitle(title: string | null | undefined): string {
  return title && title.trim().length ? title : 'Untitled';
}
