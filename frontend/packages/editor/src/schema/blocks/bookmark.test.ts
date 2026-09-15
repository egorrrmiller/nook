import { describe, expect, it } from 'vitest';
import { normalizeBookmarkUrl } from './bookmark';

describe('normalizeBookmarkUrl', () => {
  it('keeps http URLs and adds https to bare hosts', () => {
    expect(normalizeBookmarkUrl('  https://example.com/a  ')).toBe('https://example.com/a');
    expect(normalizeBookmarkUrl('example.com/a')).toBe('https://example.com/a');
    expect(normalizeBookmarkUrl('HTTP://example.com')).toBe('HTTP://example.com');
  });

  it('does not submit an empty URL', () => {
    expect(normalizeBookmarkUrl('   ')).toBeNull();
  });
});
