import type { PageProperty, PagePropertyValue } from '@nook/api-client';

export interface EditorProps {
  workspaceId: string;
  /** Property name (select options are remembered per name). */
  name: string;
  prop: PageProperty;
  readOnly?: boolean;
  onChange: (value: PagePropertyValue) => void;
}

export const valueCellClass =
  'flex min-h-8 w-full min-w-0 items-center rounded-sm px-1.5 py-1 text-sm text-foreground transition-colors hover:bg-accent focus-within:bg-accent';
export const emptyClass = 'text-muted-foreground/70';
