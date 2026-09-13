import type { Node } from '@nook/api-client';
import { generateKeyBetween, isValidOrderKey } from '../../lib/fractional';

/** One visible row of the sidebar tree. */
export interface FlatItem {
  id: string;
  node: Node;
  parentId: string | null;
  depth: number;
  /** Index among visible siblings. */
  index: number;
  hasChildren: boolean;
  expanded: boolean;
  /** Children are expanded but still loading (spinner / skeleton row). */
  loading: boolean;
  archived: boolean;
}

export const INDENT = 12;
export const ROOT_KEY = 'root';

export interface Level {
  nodes: Node[] | undefined;
  isPending: boolean;
}

/**
 * Turns per-parent child lists into the visible row list. A node is visible when every ancestor is
 * expanded; archived nodes (and their descendants) are hidden unless `showArchived`.
 */
export function flattenTree(
  levels: Map<string, Level>,
  expanded: Record<string, true | undefined>,
  showArchived: boolean,
): FlatItem[] {
  const out: FlatItem[] = [];
  const walk = (parentId: string | null, depth: number) => {
    const level = levels.get(parentId ?? ROOT_KEY);
    const nodes = (level?.nodes ?? []).filter((n) => !n.deletedAt && (showArchived || !n.archivedAt));
    nodes.forEach((node, index) => {
      const hasChildren = node.hasChildren !== false;
      const isExpanded = hasChildren && !!expanded[node.id];
      const childLevel = isExpanded ? levels.get(node.id) : undefined;
      out.push({
        id: node.id,
        node,
        parentId,
        depth,
        index,
        hasChildren,
        expanded: isExpanded,
        loading: isExpanded && (!childLevel || childLevel.isPending),
        archived: !!node.archivedAt,
      });
      if (isExpanded) walk(node.id, depth + 1);
    });
  };
  walk(null, 0);
  return out;
}

export function isDescendant(items: readonly FlatItem[], ancestorId: string, id: string): boolean {
  const byId = new Map(items.map((i) => [i.id, i]));
  let cur = byId.get(id);
  while (cur?.parentId) {
    if (cur.parentId === ancestorId) return true;
    cur = byId.get(cur.parentId);
  }
  return false;
}

export type DropKind = 'before' | 'after' | 'inside';

export interface DropTarget {
  kind: DropKind;
  /** New parent of the dragged node. */
  parentId: string | null;
  /** Depth the dragged row will have — drives the indicator's indent. */
  depth: number;
  /** Fractional position; undefined when the target's children are not loaded (server appends). */
  position: string | undefined;
  /** Row the indicator is drawn against. */
  overId: string;
}

export interface DropInput {
  items: readonly FlatItem[];
  activeId: string;
  overId: string;
  /** Pointer (or active-rect centre) Y relative to the over row's top, 0..1. */
  ratio: number;
  /** Horizontal drag offset in px, positive = further right (deeper). */
  offsetX: number;
  indent?: number;
}

function positionBetween(a: string | null | undefined, b: string | null | undefined): string | undefined {
  const va = a && isValidOrderKey(a) ? a : null;
  const vb = b && isValidOrderKey(b) ? b : null;
  try {
    return generateKeyBetween(va, vb);
  } catch {
    try {
      return generateKeyBetween(va, null);
    } catch {
      return undefined;
    }
  }
}

/**
 * Projects a drag to a concrete drop: top quarter = before, bottom quarter = after (with the
 * horizontal offset choosing the depth, like Notion / dnd-kit's sortable tree), middle = inside.
 * Returns null for no-ops and illegal drops (into own subtree).
 */
export function computeDrop({ items, activeId, overId, ratio, offsetX, indent = INDENT }: DropInput): DropTarget | null {
  if (activeId === overId) return null;
  const byId = new Map(items.map((i) => [i.id, i]));
  const active = byId.get(activeId);
  const over = byId.get(overId);
  if (!active || !over) return null;
  if (isDescendant(items, activeId, overId)) return null;

  const siblingsOf = (parentId: string | null) =>
    items.filter((i) => i.parentId === parentId && i.id !== activeId);

  if (ratio < 0.25) {
    const sibs = siblingsOf(over.parentId);
    const idx = sibs.findIndex((s) => s.id === overId);
    const prev = idx > 0 ? sibs[idx - 1] : undefined;
    // Dropping right where it already is (directly above `over` among the same siblings).
    if (active.parentId === over.parentId && active.index === over.index - 1) return null;
    return {
      kind: 'before',
      parentId: over.parentId,
      depth: over.depth,
      position: positionBetween(prev?.node.position, over.node.position),
      overId,
    };
  }

  if (ratio > 0.75) {
    // Depth range: at most one level deeper than `over` (as its first child), at least the depth of
    // the next visible row outside the dragged subtree (so we never orphan a following sibling).
    const overIdx = items.findIndex((i) => i.id === overId);
    let next: FlatItem | undefined;
    for (let i = overIdx + 1; i < items.length; i++) {
      const cand = items[i]!;
      if (cand.id === activeId || isDescendant(items, activeId, cand.id)) continue;
      next = cand;
      break;
    }
    const maxDepth = over.depth + 1;
    const minDepth = next ? Math.min(next.depth, over.depth) : 0;
    const wanted = over.depth + Math.round(offsetX / indent);
    const depth = Math.max(minDepth, Math.min(maxDepth, wanted));

    if (depth === over.depth + 1) {
      if (over.expanded) {
        const first = siblingsOf(over.id)[0];
        if (first?.id === activeId || (active.parentId === over.id && active.index === 0)) return null;
        return { kind: 'inside', parentId: over.id, depth, position: positionBetween(null, first?.node.position), overId };
      }
      return { kind: 'inside', parentId: over.id, depth, position: undefined, overId };
    }

    // Walk up from `over` to the ancestor that sits at `depth`; insert after it.
    let anchor: FlatItem = over;
    while (anchor.depth > depth) anchor = byId.get(anchor.parentId!) ?? anchor;
    const sibs = siblingsOf(anchor.parentId);
    const idx = sibs.findIndex((s) => s.id === anchor.id);
    const after = sibs[idx + 1];
    if (active.parentId === anchor.parentId && active.index === anchor.index + 1) return null;
    return {
      kind: 'after',
      parentId: anchor.parentId,
      depth,
      position: positionBetween(anchor.node.position, after?.node.position),
      overId: anchor.id,
    };
  }

  if (over.expanded) {
    const first = siblingsOf(over.id)[0];
    if (active.parentId === over.id && active.index === 0) return null;
    return { kind: 'inside', parentId: over.id, depth: over.depth + 1, position: positionBetween(null, first?.node.position), overId };
  }
  if (active.parentId === over.id) return null;
  return { kind: 'inside', parentId: over.id, depth: over.depth + 1, position: undefined, overId };
}
