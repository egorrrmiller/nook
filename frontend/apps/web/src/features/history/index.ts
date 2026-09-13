// Owner: frontend-editor — replace the implementation, keep the signature (contracts §10).
// Inspector tab "History" (§9.7). Placeholder: an empty, hidden `<div data-testid="stub-…">`.
import { createElement, type JSX } from 'react';

export function PageHistoryPanel(_p: { workspaceId: string; nodeId: string }): JSX.Element {
  return createElement('div', { 'data-testid': 'stub-page-history-panel', hidden: true });
}
