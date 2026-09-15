import { FileTextIcon, DatabaseIcon, FolderIcon } from 'lucide-react';
import type { NodeIcon as NodeIconValue, NodeKind } from '@nook/api-client';
import { cn } from '@nook/ui';
import { api } from '../../lib/api';

export interface NodeIconProps {
  icon?: NodeIconValue | null;
  kind?: NodeKind;
  /** Pixel size of the slot; the glyph scales with it. */
  size?: 16 | 18 | 19 | 20 | 24 | 32 | 48 | 72;
  className?: string;
}

/** Renders a node's emoji / image icon (or the kind's default glyph) in a fixed square slot. */
export function NodeIcon({ icon, kind = 'page', size = 18, className }: NodeIconProps) {
  const box = { width: size, height: size, fontSize: Math.round(size * 0.82), lineHeight: 1 };
  if (icon?.type === 'emoji') {
    return (
      <span
        className={cn('inline-flex shrink-0 items-center justify-center select-none', className)}
        style={box}
        aria-hidden
      >
        {icon.value}
      </span>
    );
  }
  if (icon?.type === 'url' || icon?.type === 'upload') {
    const src = icon.type === 'upload' ? api.files.thumbUrl(icon.value, 160) : icon.value;
    return (
      <span className={cn('inline-flex shrink-0 items-center justify-center', className)} style={box} aria-hidden>
        <img src={src} alt="" className="size-full rounded-[3px] object-cover" draggable={false} />
      </span>
    );
  }
  const Glyph = kind === 'database' ? DatabaseIcon : kind === 'folder' ? FolderIcon : FileTextIcon;
  const kindClass = kind === 'folder' ? 'nook-node-icon--folder' : kind === 'database' ? 'nook-node-icon--database' : 'nook-node-icon--page';
  return (
    <span className={cn('nook-node-icon inline-flex shrink-0 items-center justify-center', kindClass, className)} style={box} aria-hidden>
      <Glyph strokeWidth={1.7} style={{ width: Math.round(size * 0.76), height: Math.round(size * 0.76) }} />
    </span>
  );
}
