import { describe, expect, it } from 'vitest';
import type { GraphResponse } from '@nook/api-client';
import { matchNodes, nodeRadius, toSimGraph } from '../lib/graph-transform';

const data: GraphResponse = {
  nodes: [
    { id: 'a', title: 'Nook plan', kind: 'page', degree: 0, icon: { type: 'emoji', value: '🧭' } },
    { id: 'b', title: 'Ideas', kind: 'page', degree: 0 },
    { id: 'c', title: 'Projects', kind: 'page', degree: 0 },
  ],
  edges: [
    { source: 'c', target: 'a', kind: 'parent' },
    { source: 'b', target: 'a', kind: 'embed' },
    { source: 'a', target: 'tag-1', kind: 'tag' },
    { source: 'a', target: 'missing', kind: 'mention' },
    { source: 'b', target: 'a', kind: 'embed' },
  ],
};

describe('toSimGraph', () => {
  it('drops edges with unknown ends and de-duplicates', () => {
    const g = toSimGraph(data, { showParentEdges: true, showTags: false });
    expect(g.links).toHaveLength(2);
    expect(g.links.map((l) => l.kind).sort()).toEqual(['embed', 'parent']);
  });

  it('hides parent edges when the filter is off', () => {
    const g = toSimGraph(data, { showParentEdges: false, showTags: false });
    expect(g.links.map((l) => l.kind)).toEqual(['embed']);
  });

  it('synthesises tag nodes named from the tag list', () => {
    const g = toSimGraph(data, { showParentEdges: true, showTags: true }, [{ id: 'tag-1', name: 'roadmap' }]);
    const tag = g.nodes.find((n) => n.kind === 'tag');
    expect(tag).toMatchObject({ id: 'tag-1', title: 'roadmap' });
    expect(g.links.filter((l) => l.kind === 'tag')).toHaveLength(1);
  });

  it('recomputes degrees over the drawn edges and flags the root', () => {
    const g = toSimGraph(data, { showParentEdges: true, showTags: false }, [], 'a');
    expect(g.nodes.find((n) => n.id === 'a')).toMatchObject({ degree: 2, root: true, icon: '🧭' });
    expect(g.nodes.find((n) => n.id === 'b')?.degree).toBe(1);
  });

  it('returns an empty graph for missing data', () => {
    expect(toSimGraph(undefined, { showParentEdges: true, showTags: true })).toEqual({ nodes: [], links: [] });
  });

  it('matches nodes for search-to-highlight and sizes them by degree', () => {
    const g = toSimGraph(data, { showParentEdges: true, showTags: false });
    expect([...matchNodes(g.nodes, 'nook')]).toEqual(['a']);
    expect(matchNodes(g.nodes, '  ').size).toBe(0);
    expect(nodeRadius({ id: 'x', title: 't', kind: 'tag', degree: 9 })).toBeLessThan(nodeRadius({ id: 'y', title: 't', kind: 'page', degree: 1 }));
  });
});
