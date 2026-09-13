import { describe, expect, it } from 'vitest';
import type { Block } from '@nook/api-client';
import { collapseUnchanged, diffBlocks, diffWords, lcsPairs, summarise } from './diff';

const p = (id: string, text: string, children: Block[] = []): Block => ({
  id,
  type: 'paragraph',
  props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
  content: [{ type: 'text', text, styles: {} }],
  children,
});

describe('lcsPairs', () => {
  it('finds the longest common subsequence', () => {
    expect(lcsPairs(['a', 'b', 'c', 'd'], ['a', 'x', 'c', 'd'])).toEqual([
      [0, 0],
      [2, 2],
      [3, 3],
    ]);
    expect(lcsPairs([], ['a'])).toEqual([]);
  });
});

describe('diffWords', () => {
  it('marks inserted and deleted words, keeping equal runs', () => {
    expect(diffWords('the quick brown fox', 'the slow brown fox')).toEqual([
      { op: 'equal', text: 'the ' },
      { op: 'delete', text: 'quick' },
      { op: 'insert', text: 'slow' },
      { op: 'equal', text: ' brown fox' },
    ]);
    expect(diffWords('same', 'same')).toEqual([{ op: 'equal', text: 'same' }]);
    expect(diffWords('', 'new text')).toEqual([{ op: 'insert', text: 'new text' }]);
    expect(diffWords('gone', '')).toEqual([{ op: 'delete', text: 'gone' }]);
  });
});

describe('diffBlocks', () => {
  it('detects added, removed, changed and unchanged blocks', () => {
    const before = [p('1', 'Intro'), p('2', 'Second paragraph'), p('3', 'Bye')];
    const after = [p('1', 'Intro'), p('4', 'Brand new'), p('2', 'Second paragraph edited')];
    const entries = diffBlocks(before, after);
    expect(entries.map((e) => [e.op, e.id])).toEqual([
      ['unchanged', '1'],
      ['added', '4'],
      ['changed', '2'],
      ['removed', '3'],
    ]);
    expect(summarise(entries)).toEqual({ added: 1, removed: 1, changed: 1, unchanged: 1 });
    const changed = entries.find((e) => e.op === 'changed')!;
    expect(changed.segments).toEqual([
      { op: 'equal', text: 'Second paragraph' },
      { op: 'insert', text: ' edited' },
    ]);
  });

  it('flags a props-only change without word segments', () => {
    const before = [p('1', 'Todo')];
    const after: Block[] = [{ ...p('1', 'Todo'), type: 'checkListItem', props: { checked: true } }];
    const [entry] = diffBlocks(before, after);
    expect(entry?.op).toBe('changed');
    expect(entry?.propsOnly).toBe(true);
    expect(entry?.segments).toBeUndefined();
  });

  it('walks nested children and records their depth', () => {
    const before = [p('1', 'Parent', [p('2', 'Child')])];
    const after = [p('1', 'Parent', [p('2', 'Child edited'), p('3', 'New child')])];
    const entries = diffBlocks(before, after);
    expect(entries.map((e) => [e.op, e.id, e.depth])).toEqual([
      ['unchanged', '1', 0],
      ['changed', '2', 1],
      ['added', '3', 1],
    ]);
  });

  it('treats an empty before/after as all added / all removed', () => {
    expect(diffBlocks([], [p('1', 'x')]).map((e) => e.op)).toEqual(['added']);
    expect(diffBlocks([p('1', 'x')], []).map((e) => e.op)).toEqual(['removed']);
  });
});

describe('collapseUnchanged', () => {
  it('replaces long unchanged runs with a gap marker', () => {
    const before = [p('1', 'a'), p('2', 'b'), p('3', 'c'), p('4', 'd'), p('5', 'e')];
    const after = [p('1', 'a'), p('2', 'b'), p('3', 'c'), p('4', 'd'), p('5', 'e changed')];
    const collapsed = collapseUnchanged(diffBlocks(before, after), 1);
    expect(collapsed.map((e) => e.op)).toEqual(['gap', 'unchanged', 'changed']);
    expect(collapsed[0]).toEqual({ op: 'gap', count: 3 });
  });
});
