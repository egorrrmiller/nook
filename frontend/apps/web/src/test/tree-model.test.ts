import { describe, expect, it } from 'vitest';
import type { Node } from '@nook/api-client';
import { computeDrop, flattenTree, isDescendant, type Level } from '../components/tree/model';

const mk = (
  id: string,
  parentId: string | null,
  position: string,
  extra: Partial<Node> = {},
): Node => ({
  id,
  workspaceId: 'ws',
  parentId,
  kind: 'page',
  title: id,
  position,
  createdAt: '',
  updatedAt: '',
  effectiveRole: 'owner',
  hasChildren: false,
  ...extra,
});

// a0 (expanded) → [a0.1, a0.2]; a1; a2 (has children, collapsed); z (archived)
const levels = new Map<string, Level>([
  [
    'root',
    {
      nodes: [
        mk('A', null, 'a0', { hasChildren: true }),
        mk('B', null, 'a1'),
        mk('C', null, 'a2', { hasChildren: true }),
        mk('Z', null, 'a3', { archivedAt: 'x' }),
      ],
      isPending: false,
    },
  ],
  ['A', { nodes: [mk('A1', 'A', 'a0'), mk('A2', 'A', 'a1')], isPending: false }],
]);
const items = flattenTree(levels, { A: true }, false);

describe('flattenTree', () => {
  it('lists visible rows depth-first, hides archived unless asked', () => {
    expect(items.map((i) => `${i.depth}:${i.id}`)).toEqual(['0:A', '1:A1', '1:A2', '0:B', '0:C']);
    expect(flattenTree(levels, { A: true }, true).map((i) => i.id)).toContain('Z');
    expect(
      flattenTree(levels, { A: true, C: true }, false).find((i) => i.id === 'C')?.loading,
    ).toBe(true);
  });
  it('knows descendants', () => {
    expect(isDescendant(items, 'A', 'A2')).toBe(true);
    expect(isDescendant(items, 'B', 'A2')).toBe(false);
  });
});

describe('computeDrop', () => {
  it('refuses moving into its own subtree and no-op drops', () => {
    expect(computeDrop({ items, activeId: 'A', overId: 'A1', ratio: 0.5, offsetX: 0 })).toBeNull();
    expect(computeDrop({ items, activeId: 'A', overId: 'A', ratio: 0.5, offsetX: 0 })).toBeNull();
    // A1 is already the first child of A
    expect(computeDrop({ items, activeId: 'A1', overId: 'A', ratio: 0.5, offsetX: 0 })).toBeNull();
  });

  it('middle of a row = inside (first child when expanded, appended when collapsed)', () => {
    const intoA = computeDrop({ items, activeId: 'B', overId: 'A', ratio: 0.5, offsetX: 0 })!;
    expect(intoA).toMatchObject({ kind: 'inside', parentId: 'A', depth: 1 });
    expect(intoA.position! < 'a0').toBe(true);
    const intoC = computeDrop({ items, activeId: 'B', overId: 'C', ratio: 0.5, offsetX: 0 })!;
    expect(intoC).toMatchObject({ kind: 'inside', parentId: 'C', position: undefined });
  });

  it('allows dropping into folders but keeps file nodes as leaves', () => {
    const kindLevels = new Map<string, Level>([
      [
        'root',
        {
          nodes: [
            mk('Folder', null, 'a0', { kind: 'folder', hasChildren: true }),
            mk('File', null, 'a1', { kind: 'file' }),
          ],
          isPending: false,
        },
      ],
    ]);
    const kindItems = flattenTree(kindLevels, {}, false);
    expect(
      computeDrop({ items: kindItems, activeId: 'File', overId: 'Folder', ratio: 0.5, offsetX: 0 }),
    ).toMatchObject({
      kind: 'inside',
      parentId: 'Folder',
    });
    expect(
      computeDrop({ items: kindItems, activeId: 'Folder', overId: 'File', ratio: 0.5, offsetX: 0 }),
    ).toBeNull();
    expect(
      computeDrop({
        items: kindItems,
        activeId: 'Folder',
        overId: 'File',
        ratio: 0.9,
        offsetX: 30,
      }),
    ).toBeNull();
  });

  it('top quarter = before, with a position between the neighbours', () => {
    const d = computeDrop({ items, activeId: 'C', overId: 'B', ratio: 0.1, offsetX: 0 })!;
    expect(d).toMatchObject({ kind: 'before', parentId: null, depth: 0 });
    expect(d.position! > 'a0' && d.position! < 'a1').toBe(true);
    const first = computeDrop({ items, activeId: 'C', overId: 'A', ratio: 0.1, offsetX: 0 })!;
    expect(first.position! < 'a0').toBe(true);
  });

  it('bottom quarter = after; the horizontal offset picks the depth', () => {
    // after A2 at depth 1 (stay inside A)
    const same = computeDrop({ items, activeId: 'B', overId: 'A2', ratio: 0.9, offsetX: 0 })!;
    expect(same).toMatchObject({ kind: 'after', parentId: 'A', depth: 1, overId: 'A2' });
    expect(same.position! > 'a1').toBe(true);
    // dragged left → out-dent to root, after A
    const outdent = computeDrop({ items, activeId: 'C', overId: 'A2', ratio: 0.9, offsetX: -30 })!;
    expect(outdent).toMatchObject({ kind: 'after', parentId: null, depth: 0, overId: 'A' });
    expect(outdent.position! > 'a0' && outdent.position! < 'a1').toBe(true);
    // B already follows A at the root → no-op
    expect(
      computeDrop({ items, activeId: 'B', overId: 'A2', ratio: 0.9, offsetX: -30 }),
    ).toBeNull();
    // dragged right → becomes child of A2
    const indent = computeDrop({ items, activeId: 'B', overId: 'A2', ratio: 0.9, offsetX: 30 })!;
    expect(indent).toMatchObject({ kind: 'inside', parentId: 'A2', depth: 2 });
  });

  it('cannot out-dent above the next sibling', () => {
    // after A1 while A2 follows at depth 1 → minDepth 1, so offset left is clamped
    const d = computeDrop({ items, activeId: 'B', overId: 'A1', ratio: 0.9, offsetX: -40 })!;
    expect(d).toMatchObject({ kind: 'after', parentId: 'A', depth: 1 });
  });
});
