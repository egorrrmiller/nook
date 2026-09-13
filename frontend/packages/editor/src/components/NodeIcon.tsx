import type { NodeIcon as NodeIconValue, NodeKind } from '@nook/api-client';
import { DatabaseIcon, FileTextIcon, FolderIcon } from 'lucide-react';

/** Renders a node icon (emoji / url / upload) or the kind's default glyph. */
export function NodeIcon({
  icon,
  kind = 'page',
  size = 16,
  className,
}: {
  icon?: NodeIconValue | null;
  kind?: NodeKind;
  size?: number;
  className?: string;
}) {
  if (icon?.type === 'emoji') {
    return (
      <span className={className} style={{ fontSize: size, lineHeight: 1 }} aria-hidden>
        {icon.value}
      </span>
    );
  }
  if (icon?.type === 'url' || icon?.type === 'upload') {
    const src = icon.type === 'upload' ? `/api/files/${icon.value}/thumb?w=160` : icon.value;
    return <img className={className} src={src} alt="" width={size} height={size} style={{ borderRadius: 3, objectFit: 'cover' }} />;
  }
  const Glyph = kind === 'database' ? DatabaseIcon : kind === 'folder' ? FolderIcon : FileTextIcon;
  return <Glyph className={className} size={size} aria-hidden style={{ opacity: 0.6 }} />;
}
