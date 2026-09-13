import { describe, expect, it } from 'vitest';
import { isEmbeddableUrl, resolveEmbedProvider } from './providers';

describe('resolveEmbedProvider', () => {
  it('maps YouTube watch / short / embed URLs to the nocookie player', () => {
    for (const u of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    ]) {
      const r = resolveEmbedProvider(u);
      expect(r?.provider).toBe('YouTube');
      expect(r?.embedUrl).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
      expect(r?.aspectRatio).toBeCloseTo(16 / 9);
    }
    expect(resolveEmbedProvider('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s')?.embedUrl).toContain('start=42');
  });

  it('handles Vimeo, Loom, Figma, CodePen, Spotify, Twitter, Maps', () => {
    expect(resolveEmbedProvider('https://vimeo.com/123456789')?.embedUrl).toBe('https://player.vimeo.com/video/123456789');
    expect(resolveEmbedProvider('https://www.loom.com/share/0123456789abcdef0123')?.provider).toBe('Loom');
    expect(resolveEmbedProvider('https://www.figma.com/design/abc/My-file')?.embedUrl).toContain('figma.com/embed');
    expect(resolveEmbedProvider('https://codepen.io/user/pen/abcXYZ')?.embedUrl).toBe(
      'https://codepen.io/user/embed/abcXYZ?default-tab=result',
    );
    expect(resolveEmbedProvider('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC')?.height).toBe(152);
    expect(resolveEmbedProvider('https://x.com/nook/status/1234567890')?.embedUrl).toContain('Tweet.html?id=1234567890');
    expect(resolveEmbedProvider('https://www.google.com/maps/place/Berlin')?.embedUrl).toContain('output=embed');
  });

  it('returns null for unknown or invalid URLs', () => {
    expect(resolveEmbedProvider('https://example.com/page')).toBeNull();
    expect(resolveEmbedProvider('https://www.youtube.com/')).toBeNull();
    expect(resolveEmbedProvider('not a url')).toBeNull();
    expect(resolveEmbedProvider('javascript:alert(1)')).toBeNull();
    expect(isEmbeddableUrl('https://example.com')).toBe(false);
    expect(isEmbeddableUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(true);
  });
});
