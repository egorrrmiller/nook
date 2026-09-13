import { cn } from '@nook/ui';
import type { LinkKind } from '@nook/api-client';

const LABELS: Record<LinkKind, string> = {
  mention: 'Mention',
  wikilink: 'Wikilink',
  embed: 'Embed',
  synced: 'Synced',
  relation: 'Relation',
  url: 'URL',
};

export function KindBadge({ kind, className }: { kind: LinkKind; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-[18px] shrink-0 items-center rounded-sm border border-border px-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase',
        className,
      )}
    >
      {LABELS[kind] ?? kind}
    </span>
  );
}
