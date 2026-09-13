import type { Breadcrumb } from '@nook/api-client';
import { cn } from '@nook/ui';
import { nodeTitle } from '../../lib/utils';

/** "Parent / Child" secondary line used by the palette, trash and move-to rows. */
export function BreadcrumbText({ crumbs, className }: { crumbs: Breadcrumb; className?: string }) {
  if (!crumbs.length) return null;
  return (
    <span className={cn('truncate text-xs text-fg-muted', className)}>
      {crumbs.map((c) => nodeTitle(c.title)).join(' / ')}
    </span>
  );
}
