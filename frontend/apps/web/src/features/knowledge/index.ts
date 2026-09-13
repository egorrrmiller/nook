// Owner: frontend-knowledge — replace the implementation, keep the signatures (contracts §10).
// Integration slots rendered by PageView / the shell. Placeholders until the knowledge agent lands:
// nullable slots return null, the rest render an empty, hidden `<div data-testid="stub-…">`.
import { createElement, type JSX } from 'react';

const stub = (id: string): JSX.Element =>
  createElement('div', { 'data-testid': `stub-${id}`, hidden: true });

/** Rendered by PageView under the title (properties bar, §9.3). */
export function PageProperties(_p: {
  workspaceId: string;
  nodeId: string;
  readOnly?: boolean;
}): JSX.Element | null {
  return null;
}

/** Inspector tab "Backlinks" (§9.1). */
export function BacklinksPanel(_p: { workspaceId: string; nodeId: string }): JSX.Element {
  return stub('backlinks-panel');
}

/** Full-text search dialog (§9.5); opened via `useUiStore().searchOpen`. */
export function SearchDialog(_p: {
  workspaceId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialQuery?: string;
}): JSX.Element {
  return stub('search-dialog');
}

/** Export dialog (§9.8). */
export function ExportDialog(_p: {
  workspaceId: string;
  nodeIds: string[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}): JSX.Element {
  return stub('export-dialog');
}

/** Import dialog (§9.8). */
export function ImportDialog(_p: {
  workspaceId: string;
  parentId?: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}): JSX.Element {
  return stub('import-dialog');
}

/** Tag chips for sidebar/tree hover and palette rows (§9.2). */
export function TagChips(_p: {
  workspaceId: string;
  nodeId: string;
  compact?: boolean;
}): JSX.Element | null {
  return null;
}
