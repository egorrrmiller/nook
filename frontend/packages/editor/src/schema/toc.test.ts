import { describe, expect, it } from 'vitest';
import { extractHeadings, tocDepths } from './toc';
import type { LooseBlock } from '../util/text';

const h = (id: string, level: number, text: string, children: LooseBlock[] = []): LooseBlock => ({
  id,
  type: 'heading',
  props: { level },
  content: [{ type: 'text', text, styles: {} }],
  children,
});
const p = (id: string, text: string, children: LooseBlock[] = []): LooseBlock => ({
  id,
  type: 'paragraph',
  props: {},
  content: [{ type: 'text', text, styles: {} }],
  children,
});

describe('extractHeadings', () => {
  it('collects headings in document order, including nested ones', () => {
    const doc = [h('a', 1, 'Intro'), p('x', 'text', [h('b', 2, 'Nested')]), h('c', 3, 'Deep'), p('y', 'more')];
    expect(extractHeadings(doc)).toEqual([
      { id: 'a', level: 1, text: 'Intro' },
      { id: 'b', level: 2, text: 'Nested' },
      { id: 'c', level: 3, text: 'Deep' },
    ]);
  });

  it('skips empty headings and levels above the limit', () => {
    const doc = [h('a', 1, '   '), h('b', 5, 'too deep'), h('c', 2, 'ok')];
    expect(extractHeadings(doc)).toEqual([{ id: 'c', level: 2, text: 'ok' }]);
  });

  it('joins link and styled runs into the heading text', () => {
    const doc: LooseBlock[] = [
      {
        id: 'a',
        type: 'heading',
        props: { level: 2 },
        content: [
          { type: 'text', text: 'See ', styles: {} },
          { type: 'link', href: 'https://x', content: [{ type: 'text', text: 'docs', styles: { bold: true } }] },
        ],
        children: [],
      },
    ];
    expect(extractHeadings(doc)[0]?.text).toBe('See docs');
  });
});

describe('tocDepths', () => {
  it('normalises depths to the shallowest heading', () => {
    const entries = extractHeadings([h('a', 2, 'A'), h('b', 3, 'B'), h('c', 2, 'C')]);
    expect(tocDepths(entries)).toEqual([0, 1, 0]);
    expect(tocDepths([])).toEqual([]);
  });
});
