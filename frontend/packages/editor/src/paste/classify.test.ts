import { describe, expect, it } from 'vitest';
import { classifyPastedText, looksLikeMarkdown, parseInternalPageUrl } from './classify';

const ctx = { origin: 'https://nook.local', workspaceId: 'ws1' };

describe('classifyPastedText', () => {
  it('detects a bare external URL and whether it is embeddable', () => {
    expect(classifyPastedText('https://example.com/article', ctx)).toEqual({
      kind: 'url',
      url: 'https://example.com/article',
      embeddable: false,
    });
    expect(classifyPastedText('  https://youtu.be/dQw4w9WgXcQ \n', ctx)).toMatchObject({ kind: 'url', embeddable: true });
  });

  it('flags direct media links', () => {
    expect(classifyPastedText('https://cdn.example.com/a/photo.JPG', ctx)).toMatchObject({ kind: 'url', media: 'image' });
    expect(classifyPastedText('https://cdn.example.com/doc.pdf', ctx)).toMatchObject({ kind: 'url', media: 'pdf' });
  });

  it('recognises internal page and block links of the same workspace', () => {
    expect(classifyPastedText('https://nook.local/w/ws1/p/node-1#b-block-9', ctx)).toEqual({
      kind: 'url',
      url: 'https://nook.local/w/ws1/p/node-1#b-block-9',
      internal: { nodeId: 'node-1', blockId: 'block-9' },
      embeddable: false,
    });
    expect(classifyPastedText('/w/ws1/p/node-2', ctx)).toMatchObject({ internal: { nodeId: 'node-2' } });
    // Other origin / workspace → plain external URL.
    expect(classifyPastedText('https://other.host/w/ws1/p/node-1', ctx)).toEqual({
      kind: 'url',
      url: 'https://other.host/w/ws1/p/node-1',
      embeddable: false,
    });
    expect(classifyPastedText('https://nook.local/w/ws2/p/node-1', ctx)).not.toHaveProperty('internal');
  });

  it('classifies markdown vs plain text', () => {
    expect(classifyPastedText('# Title\n\n- one\n- two', ctx)).toEqual({ kind: 'markdown' });
    expect(classifyPastedText('Just a sentence with https://example.com inside.', ctx)).toEqual({ kind: 'text' });
    expect(classifyPastedText('', ctx)).toEqual({ kind: 'text' });
    expect(looksLikeMarkdown('**bold** and [link](https://x)')).toBe(true);
    expect(looksLikeMarkdown('hello world')).toBe(false);
  });
});

describe('parseInternalPageUrl', () => {
  it('parses app-relative and absolute forms', () => {
    expect(parseInternalPageUrl('/w/a/p/b')).toEqual({ workspaceId: 'a', nodeId: 'b' });
    expect(parseInternalPageUrl('https://nook.local/w/a/p/b#b-c', { origin: 'https://nook.local' })).toEqual({
      workspaceId: 'a',
      nodeId: 'b',
      blockId: 'c',
    });
    expect(parseInternalPageUrl('/w/a/p/b#page=12')).toEqual({ workspaceId: 'a', nodeId: 'b', page: 12 });
    expect(parseInternalPageUrl('/w/a/graph')).toBeNull();
  });
});
