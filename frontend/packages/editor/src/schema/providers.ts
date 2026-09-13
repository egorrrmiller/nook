/**
 * Client-side embed provider table (PLAN §1.1: one generic embed + known providers). The server's
 * `POST /api/links/preview` does oEmbed discovery for everything else; this table lets the embed
 * block render instantly for the common cases and is the fallback when the preview call fails.
 */
export interface EmbedResolution {
  provider: string;
  /** URL to put in the iframe. */
  embedUrl: string;
  /** width / height, used for the initial box size. */
  aspectRatio?: number;
  /** Fixed height in px when the provider has no meaningful aspect ratio (players, gists). */
  height?: number;
}

interface Provider {
  name: string;
  test: RegExp;
  resolve: (url: URL, match: RegExpMatchArray) => EmbedResolution | null;
}

const YOUTUBE_ID = /^[\w-]{6,}$/;

const PROVIDERS: Provider[] = [
  {
    name: 'YouTube',
    test: /^(?:www\.|m\.)?(?:youtube\.com|youtu\.be|youtube-nocookie\.com)$/i,
    resolve: (url) => {
      let id: string | null = null;
      if (/youtu\.be$/i.test(url.hostname)) id = url.pathname.slice(1).split('/')[0] ?? null;
      else if (url.pathname.startsWith('/watch')) id = url.searchParams.get('v');
      else {
        const m = /^\/(?:embed|shorts|live|v)\/([^/?]+)/.exec(url.pathname);
        id = m?.[1] ?? null;
      }
      if (!id || !YOUTUBE_ID.test(id)) return null;
      const start = url.searchParams.get('t') ?? url.searchParams.get('start');
      const q = start ? `?start=${parseInt(start, 10) || 0}` : '';
      return { provider: 'YouTube', embedUrl: `https://www.youtube-nocookie.com/embed/${id}${q}`, aspectRatio: 16 / 9 };
    },
  },
  {
    name: 'Vimeo',
    test: /^(?:www\.|player\.)?vimeo\.com$/i,
    resolve: (url) => {
      const m = /(\d{5,})/.exec(url.pathname);
      if (!m) return null;
      return { provider: 'Vimeo', embedUrl: `https://player.vimeo.com/video/${m[1]}`, aspectRatio: 16 / 9 };
    },
  },
  {
    name: 'Loom',
    test: /^(?:www\.)?loom\.com$/i,
    resolve: (url) => {
      const m = /^\/(?:share|embed)\/([a-f0-9]{16,})/i.exec(url.pathname);
      if (!m) return null;
      return { provider: 'Loom', embedUrl: `https://www.loom.com/embed/${m[1]}`, aspectRatio: 16 / 9 };
    },
  },
  {
    name: 'Figma',
    test: /^(?:www\.)?figma\.com$/i,
    resolve: (url) => {
      if (!/^\/(?:file|design|proto|board)\//.test(url.pathname)) return null;
      return {
        provider: 'Figma',
        embedUrl: `https://www.figma.com/embed?embed_host=nook&url=${encodeURIComponent(url.toString())}`,
        aspectRatio: 16 / 10,
      };
    },
  },
  {
    name: 'CodePen',
    test: /^codepen\.io$/i,
    resolve: (url) => {
      const m = /^\/([^/]+)\/(?:pen|embed)\/([^/?]+)/.exec(url.pathname);
      if (!m) return null;
      return {
        provider: 'CodePen',
        embedUrl: `https://codepen.io/${m[1]}/embed/${m[2]}?default-tab=result`,
        height: 400,
      };
    },
  },
  {
    name: 'GitHub Gist',
    test: /^gist\.github\.com$/i,
    resolve: (url) => {
      const m = /^\/([^/]+)\/([a-f0-9]{8,})/i.exec(url.pathname);
      if (!m) return null;
      // Gists only ship a script embed; wrap it in a data-URL document so it works in an iframe.
      const html = `<!doctype html><body style="margin:0"><script src="https://gist.github.com/${m[1]}/${m[2]}.js"></script></body>`;
      return { provider: 'GitHub Gist', embedUrl: `data:text/html;charset=utf-8,${encodeURIComponent(html)}`, height: 360 };
    },
  },
  {
    name: 'Google Maps',
    test: /^(?:www\.)?google\.[a-z.]+$/i,
    resolve: (url) => {
      if (!url.pathname.startsWith('/maps')) return null;
      if (url.pathname.startsWith('/maps/embed')) return { provider: 'Google Maps', embedUrl: url.toString(), aspectRatio: 4 / 3 };
      const q = url.searchParams.get('q') ?? /\/place\/([^/]+)/.exec(url.pathname)?.[1];
      if (!q) return null;
      return {
        provider: 'Google Maps',
        embedUrl: `https://www.google.com/maps?q=${encodeURIComponent(decodeURIComponent(q))}&output=embed`,
        aspectRatio: 4 / 3,
      };
    },
  },
  {
    name: 'Spotify',
    test: /^open\.spotify\.com$/i,
    resolve: (url) => {
      const m = /^\/(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]+)/.exec(url.pathname);
      if (!m) return null;
      return { provider: 'Spotify', embedUrl: `https://open.spotify.com/embed/${m[1]}/${m[2]}`, height: m[1] === 'track' ? 152 : 352 };
    },
  },
  {
    name: 'SoundCloud',
    test: /^(?:www\.)?soundcloud\.com$/i,
    resolve: (url) => ({
      provider: 'SoundCloud',
      embedUrl: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url.toString())}&visual=false`,
      height: 166,
    }),
  },
  {
    name: 'Twitter',
    test: /^(?:www\.|mobile\.)?(?:twitter|x)\.com$/i,
    resolve: (url) => {
      const m = /^\/[^/]+\/status\/(\d+)/.exec(url.pathname);
      if (!m) return null;
      return { provider: 'Twitter', embedUrl: `https://platform.twitter.com/embed/Tweet.html?id=${m[1]}&dnt=true`, height: 550 };
    },
  },
];

export function parseHttpUrl(raw: string): URL | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u;
  } catch {
    return null;
  }
}

/** Known-provider match, or `null` when the URL is not recognised (caller falls back to a plain iframe). */
export function resolveEmbedProvider(raw: string): EmbedResolution | null {
  const url = parseHttpUrl(raw);
  if (!url) return null;
  for (const p of PROVIDERS) {
    const m = p.test.exec(url.hostname);
    if (m) {
      const r = p.resolve(url, m);
      if (r) return r;
    }
  }
  return null;
}

/** Whether a pasted URL is worth offering as an embed (known provider). */
export function isEmbeddableUrl(raw: string): boolean {
  return resolveEmbedProvider(raw) !== null;
}

export const KNOWN_PROVIDERS: readonly string[] = PROVIDERS.map((p) => p.name);
