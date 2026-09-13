import { describe, expect, it } from 'vitest';
import { highlightTerms, parseSnippet, snippetText } from '../lib/snippet';

describe('snippet sanitizer', () => {
  it('keeps <mark> runs and drops every other tag', () => {
    const parts = parseSnippet('Nook is a <mark>self-hosted</mark> <b>Notion</b>');
    expect(parts).toEqual([
      { text: 'Nook is a ', mark: false },
      { text: 'self-hosted', mark: true },
      { text: ' Notion', mark: false },
    ]);
  });

  it('strips script/img payloads instead of rendering them', () => {
    const parts = parseSnippet('<script>alert(1)</script><img src=x onerror=alert(1)>hello <mark>world</mark>');
    expect(snippetText(parts.map((p) => (p.mark ? `<mark>${p.text}</mark>` : p.text)).join(''))).toBe('alert(1)hello world');
    expect(parts.some((p) => p.text.includes('<'))).toBe(false);
  });

  it('decodes entities produced by ts_headline', () => {
    expect(snippetText('a &amp; b &lt;c&gt; &#39;d&#39;')).toBe("a & b <c> 'd'");
  });

  it('handles unbalanced marks without throwing', () => {
    expect(parseSnippet('<mark>open only')).toEqual([{ text: 'open only', mark: true }]);
    expect(parseSnippet('close only</mark>')).toEqual([{ text: 'close only', mark: false }]);
  });

  it('highlights plain-text terms case-insensitively', () => {
    const parts = highlightTerms('See Nook plan and the nook roadmap', ['Nook plan', 'nook']);
    expect(parts.filter((p) => p.mark).map((p) => p.text)).toEqual(['Nook plan', 'nook']);
  });

  it('returns the text unchanged when there are no terms', () => {
    expect(highlightTerms('plain', [])).toEqual([{ text: 'plain', mark: false }]);
  });
});
