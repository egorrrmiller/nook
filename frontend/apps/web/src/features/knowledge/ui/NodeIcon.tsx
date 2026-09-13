import { FileTextIcon, FolderIcon, TableIcon, PaperclipIcon, RowsIcon } from 'lucide-react';
import type { NodeIcon as NodeIconValue, NodeKind } from '@nook/api-client';
import { cn } from '@nook/ui';

export interface NodeIconProps {
  icon?: NodeIconValue | null;
  kind?: NodeKind;
  className?: string;
}

/** Emoji / uploaded icon or a kind fallback (page, folder, database, …). */
export function NodeIcon({ icon, kind = 'page', className }: NodeIconProps) {
  if (icon?.type === 'emoji')
    return (
      <span className={cn('inline-flex size-4 shrink-0 items-center justify-center text-[14px] leading-none', className)} aria-hidden>
        {icon.value}
      </span>
    );
  if (icon?.type === 'url' || icon?.type === 'upload') {
    const src = icon.type === 'url' ? icon.value : `/api/files/${icon.value}/thumb?w=160`;
    return <img src={src} alt="" className={cn('size-4 shrink-0 rounded-sm object-cover', className)} />;
  }
  const Icon =
    kind === 'folder' ? FolderIcon : kind === 'database' ? TableIcon : kind === 'file' ? PaperclipIcon : kind === 'collection_row' ? RowsIcon : FileTextIcon;
  return <Icon className={cn('size-4 shrink-0 text-muted-foreground', className)} aria-hidden />;
}
