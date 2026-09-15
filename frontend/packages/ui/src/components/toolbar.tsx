import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

export type ToolbarProps = ComponentProps<'div'>;

/** Shared inline toolbar layout. Visual treatment remains overridable per feature. */
export function Toolbar({ className, ...props }: ToolbarProps) {
  return <div role="toolbar" data-slot="toolbar" className={cn('flex items-center gap-1', className)} {...props} />;
}
