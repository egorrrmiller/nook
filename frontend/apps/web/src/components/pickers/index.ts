// Owner: frontend-shell — replace the implementation, keep the signatures (contracts §10).
// Icon / cover pickers used by the PageView header (frontend-editor imports them from here).
// Placeholders: render `children` (the trigger) as-is, no popover.
import { createElement, Fragment, type JSX, type ReactNode } from 'react';
import type { NodeCover, NodeIcon } from '@nook/api-client';

/** Popover: Emoji | Upload | Link tabs. */
export function IconPicker(p: {
  value: NodeIcon | null | undefined;
  nodeId: string;
  onChange: (icon: NodeIcon | null) => void;
  children: ReactNode;
}): JSX.Element {
  return createElement(Fragment, null, p.children);
}

/** Gallery | Upload | Link | Reposition. */
export function CoverPicker(p: {
  value: NodeCover | null | undefined;
  nodeId: string;
  onChange: (cover: NodeCover | null) => void;
  children: ReactNode;
}): JSX.Element {
  return createElement(Fragment, null, p.children);
}
