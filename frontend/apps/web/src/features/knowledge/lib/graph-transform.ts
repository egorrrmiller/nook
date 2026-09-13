import type { GraphEdgeKind, GraphResponse, NodeKind, Tag } from '@nook/api-client';

export type SimKind = NodeKind | 'tag';

export interface SimNode {
  id: string;
  title: string;
  icon?: string | null;
  kind: SimKind;
  degree: number;
  /** Set for the root when the graph is focused (`rootId`). */
  root?: boolean;
  // d3-force mutable fields
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface SimLink {
  source: string | SimNode;
  target: string | SimNode;
  kind: GraphEdgeKind;
}

export interface GraphFilters {
  showParentEdges: boolean;
  showTags: boolean;
}

export interface SimGraph {
  nodes: SimNode[];
  links: SimLink[];
}

/**
 * Turns the §9.6 response into what d3-force consumes. Tag edges (`kind: "tag"`) point at tag ids
 * that are not in `nodes`; we synthesise a small `tag` node for each (named from the workspace tag
 * list when available). Edges whose ends are unknown are dropped. Degrees are recomputed after
 * filtering so node radius reflects what is actually drawn.
 */
export function toSimGraph(
  data: GraphResponse | undefined,
  filters: GraphFilters,
  tags: Tag[] = [],
  rootId?: string | null,
): SimGraph {
  if (!data) return { nodes: [], links: [] };
  const nodes = new Map<string, SimNode>();
  for (const n of data.nodes) {
    nodes.set(n.id, {
      id: n.id,
      title: n.title,
      icon: n.icon?.type === 'emoji' ? n.icon.value : null,
      kind: n.kind,
      degree: 0,
      root: rootId ? n.id === rootId : undefined,
    });
  }
  const tagName = new Map(tags.map((t) => [t.id, t.name]));
  const links: SimLink[] = [];
  const seen = new Set<string>();
  for (const e of data.edges) {
    if (e.kind === 'parent' && !filters.showParentEdges) continue;
    if (e.kind === 'tag') {
      if (!filters.showTags) continue;
      for (const end of [e.source, e.target]) {
        if (!nodes.has(end)) nodes.set(end, { id: end, title: tagName.get(end) ?? 'tag', kind: 'tag', degree: 0 });
      }
    }
    if (!nodes.has(e.source) || !nodes.has(e.target) || e.source === e.target) continue;
    const key = `${e.source}→${e.target}:${e.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ source: e.source, target: e.target, kind: e.kind });
    nodes.get(e.source)!.degree += 1;
    nodes.get(e.target)!.degree += 1;
  }
  // Tag nodes without any edge left (e.g. tags shown but no page carries them) are dropped.
  for (const [id, n] of nodes) if (n.kind === 'tag' && n.degree === 0) nodes.delete(id);
  return { nodes: [...nodes.values()], links };
}

/** Ids of nodes whose title matches `query` (case-insensitive substring); empty query → empty set. */
export function matchNodes(nodes: SimNode[], query: string): Set<string> {
  const q = query.trim().toLowerCase();
  if (!q) return new Set();
  return new Set(nodes.filter((n) => n.title.toLowerCase().includes(q)).map((n) => n.id));
}

export function nodeRadius(n: SimNode): number {
  if (n.kind === 'tag') return 3.5;
  return Math.min(14, 5 + Math.sqrt(n.degree) * 1.8);
}
