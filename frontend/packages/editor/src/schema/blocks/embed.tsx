import { createReactBlockSpec, type ReactCustomBlockRenderProps } from '@blocknote/react';
import { useEffect, useRef, useState } from 'react';
import { ExternalLinkIcon } from 'lucide-react';
import { useEditorHost } from '../../host-context';
import { parseHttpUrl, resolveEmbedProvider } from '../providers';
import { UrlInput } from './bookmark';

export const embedConfig = {
  type: 'embed',
  propSchema: {
    url: { default: '' },
    /** Resolved iframe URL (provider table client-side, or `LinkPreview.embed.url` from the server). */
    embedUrl: { default: '' },
    provider: { default: '' },
    /** width / height; 0 = use `height`. */
    aspectRatio: { default: 0, type: 'number' },
    height: { default: 400, type: 'number' },
    caption: { default: '' },
  },
  content: 'none',
} as const;

const IFRAME_SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-presentation allow-forms';

function EmbedView({ block, editor }: ReactCustomBlockRenderProps<typeof embedConfig>) {
  const { api } = useEditorHost();
  const { url, embedUrl, provider, aspectRatio, height, caption } = block.props;
  const [resizing, setResizing] = useState<{ startY: number; startH: number } | null>(null);
  const frame = useRef<HTMLDivElement>(null);

  // Resolve the iframe target once per URL: provider table first, then the server preview.
  useEffect(() => {
    if (!url || embedUrl) return;
    const known = resolveEmbedProvider(url);
    if (known) {
      editor.updateBlock(block.id, {
        props: {
          embedUrl: known.embedUrl,
          provider: known.provider,
          aspectRatio: known.aspectRatio ?? 0,
          height: known.height ?? 400,
        },
      });
      return;
    }
    let live = true;
    api.links
      .preview(url)
      .then((p) => {
        if (!live) return;
        const e = p.embed;
        const w = e?.width;
        const h = e?.height;
        editor.updateBlock(block.id, {
          props: {
            embedUrl: e?.url ?? url,
            provider: e?.provider ?? parseHttpUrl(url)?.hostname ?? '',
            aspectRatio: e?.aspectRatio ?? (w && h ? w / h : 0),
            height: h ?? 400,
          },
        });
      })
      .catch(() => live && editor.updateBlock(block.id, { props: { embedUrl: url, provider: parseHttpUrl(url)?.hostname ?? '' } }));
    return () => {
      live = false;
    };
  }, [url, embedUrl, api, editor, block.id]);

  useEffect(() => {
    if (!resizing) return;
    const move = (e: PointerEvent) => {
      const h = Math.max(120, Math.round(resizing.startH + (e.clientY - resizing.startY)));
      if (frame.current) frame.current.style.height = `${h}px`;
    };
    const up = (e: PointerEvent) => {
      const h = Math.max(120, Math.round(resizing.startH + (e.clientY - resizing.startY)));
      setResizing(null);
      editor.updateBlock(block.id, { props: { height: h, aspectRatio: 0 } });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [resizing, editor, block.id]);

  if (!url) {
    return (
      <UrlInput
        placeholder="Paste a link to embed (YouTube, Figma, Maps, …)"
        buttonLabel="Embed link"
        testId="embed-input"
        onSubmit={(u) => editor.updateBlock(block.id, { props: { url: u, embedUrl: '' } })}
      />
    );
  }

  const style = aspectRatio > 0 ? { aspectRatio: String(aspectRatio) } : { height: `${height}px` };
  return (
    <figure className="nook-embed" contentEditable={false} data-testid="embed-block" data-provider={provider}>
      <div className="nook-embed__frame" style={style} ref={frame}>
        {embedUrl ? (
          <iframe
            src={embedUrl}
            title={provider ? `${provider} embed` : 'Embedded content'}
            sandbox={IFRAME_SANDBOX}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        ) : (
          <div className="nook-embed__loading">Loading embed…</div>
        )}
        {editor.isEditable ? (
          <div
            className="nook-embed__resize"
            role="separator"
            aria-label="Resize embed"
            onPointerDown={(e) => {
              e.preventDefault();
              setResizing({ startY: e.clientY, startH: frame.current?.offsetHeight ?? height });
            }}
          />
        ) : null}
      </div>
      <div className="nook-embed__meta">
        <a href={url} target="_blank" rel="noopener noreferrer nofollow">
          <ExternalLinkIcon size={12} /> {provider || parseHttpUrl(url)?.hostname}
        </a>
      </div>
      {caption ? <figcaption className="bn-file-caption">{caption}</figcaption> : null}
    </figure>
  );
}

/** Generic iframe embed with a client-side known-provider table (§1.1 S). */
export const EmbedBlock = createReactBlockSpec(embedConfig, {
  render: EmbedView,
  toExternalHTML: ({ block }) => (
    <a href={block.props.url} className="nook-embed">
      {block.props.url}
    </a>
  ),
  parse: (el) => {
    if (el.tagName === 'A' && el.classList.contains('nook-embed')) return { url: el.getAttribute('href') ?? '' };
    return undefined;
  },
});
