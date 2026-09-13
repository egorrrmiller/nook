import type { CSSProperties } from 'react';

/** Notion-like option/tag palette. Values are the "strong" colour; chips derive a tinted bg. */
export const TAG_PALETTE: { name: string; value: string }[] = [
  { name: 'Gray', value: '#787774' },
  { name: 'Brown', value: '#9f6b53' },
  { name: 'Orange', value: '#d9730d' },
  { name: 'Yellow', value: '#cb912f' },
  { name: 'Green', value: '#448361' },
  { name: 'Blue', value: '#337ea9' },
  { name: 'Purple', value: '#9065b0' },
  { name: 'Pink', value: '#c14c8a' },
  { name: 'Red', value: '#d44c47' },
];

export function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Deterministic colour for an option / tag without an explicit one. */
export function colorForLabel(label: string): string {
  return TAG_PALETTE[hashString(label.toLowerCase()) % TAG_PALETTE.length]!.value;
}

/** Inline style for a chip: tinted background (theme-safe via color-mix) and strong text. */
export function chipStyle(color: string | null | undefined, label = ''): CSSProperties {
  const c = color && /^#[0-9a-f]{3,8}$/i.test(color) ? color : colorForLabel(label);
  return {
    backgroundColor: `color-mix(in srgb, ${c} 16%, transparent)`,
    color: `color-mix(in srgb, ${c} 82%, var(--foreground))`,
  };
}
