import { createReactBlockSpec, type ReactCustomBlockRenderProps } from '@blocknote/react';
import { useEffect, useState } from 'react';
import { GlobeIcon, LinkIcon, RefreshCwIcon } from 'lucide-react';
import { Button, IconButton, Input } from '@nook/ui';
import { useEditorHost } from '../../host-context';
import { parseHttpUrl } from '../providers';

export const bookmarkConfig = {
  type: 'bookmark',
  propSchema: {
    url: { default: '' },
    title: { default: '' },
    description: { default: '' },
    imageUrl: { default: '' },
    faviconUrl: { default: '' },
    siteName: { default: '' },
    /** 0 = not fetched, 1 = fetched (ok or fallback), 2 = fetch failed */
    fetched: { default: 0, type: 'number' },
  },
  content: 'none',
} as const;

/** Normalise the URL at the control boundary while keeping the stored prop absolute. */
export function normalizeBookmarkUrl(value: string): string | null {
  const url = value.trim();
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

export function UrlInput({
  placeholder,
  buttonLabel,
  onSubmit,
  testId,
}: {
  placeholder: string;
  buttonLabel: string;
  onSubmit: (url: string) => void;
  testId?: string;
}) {
  const [value, setValue] = useState('');
  const submit = () => {
    const url = normalizeBookmarkUrl(value);
    if (url) onSubmit(url);
  };
  return (
    <div className="nook-url-input" contentEditable={false} data-testid={testId}>
      <LinkIcon size={16} className="nook-url-input__icon" />
      <Input
        autoFocus
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
        aria-label={placeholder}
      />
      <Button type="button" size="sm" onMouseDown={(e) => e.preventDefault()} onClick={submit}>
        {buttonLabel}
      </Button>
    </div>
  );
}

function hostOf(url: string): string {
  return parseHttpUrl(url)?.hostname.replace(/^www\./, '') ?? url;
}

function BookmarkView({ block, editor }: ReactCustomBlockRenderProps<typeof bookmarkConfig>) {
  const { api } = useEditorHost();
  const { url, title, description, imageUrl, faviconUrl, siteName, fetched } = block.props;
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!url || fetched !== 0 || loading) return;
    let live = true;
    setLoading(true);
    api.links
      .preview(url)
      .then((p) => {
        if (!live) return;
        editor.updateBlock(block.id, {
          props: {
            title: p.title ?? '',
            description: p.description ?? '',
            imageUrl: p.imageUrl ?? '',
            faviconUrl: p.faviconUrl ?? '',
            siteName: p.siteName ?? '',
            fetched: 1,
          },
        });
      })
      .catch(() => {
        if (live) editor.updateBlock(block.id, { props: { fetched: 2 } });
      })
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
    // Only re-run when the URL or fetched flag changes; `block` identity churns on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, fetched, api, editor, block.id]);

  if (!url) {
    return (
      <UrlInput
        placeholder="Paste a link to create a bookmark…"
        buttonLabel="Create bookmark"
        testId="bookmark-input"
        onSubmit={(u) => editor.updateBlock(block.id, { props: { url: u, fetched: 0 } })}
      />
    );
  }

  const heading = title || hostOf(url);
  return (
    <a
      className="nook-bookmark"
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      contentEditable={false}
      data-testid="bookmark-block"
      data-loading={loading || fetched === 0 || undefined}
    >
      <div className="nook-bookmark__body">
        <div className="nook-bookmark__title">{heading}</div>
        {description ? <div className="nook-bookmark__desc">{description}</div> : null}
        <div className="nook-bookmark__site">
          {faviconUrl ? (
            <img src={faviconUrl} alt="" width={16} height={16} />
          ) : (
            <GlobeIcon size={14} />
          )}
          <span>{siteName || hostOf(url)}</span>
          <span className="nook-bookmark__url">{url}</span>
          {fetched === 2 ? (
            <IconButton
              label="Retry preview"
              tooltip={false}
              size="icon-sm"
              variant="subtle"
              type="button"
              className="nook-bookmark__retry"
              title="Retry preview"
              onClick={(e) => {
                e.preventDefault();
                editor.updateBlock(block.id, { props: { fetched: 0 } });
              }}
            >
              <RefreshCwIcon size={12} />
            </IconButton>
          ) : null}
        </div>
      </div>
      {imageUrl ? (
        <div className="nook-bookmark__image">
          <img src={imageUrl} alt="" loading="lazy" />
        </div>
      ) : null}
    </a>
  );
}

/** Web bookmark: URL → `POST /api/links/preview` → card (title, description, image, favicon). */
export const BookmarkBlock = createReactBlockSpec(bookmarkConfig, {
  render: BookmarkView,
  toExternalHTML: ({ block }) => (
    <a href={block.props.url} className="nook-bookmark" data-title={block.props.title}>
      {block.props.title || block.props.url}
    </a>
  ),
  parse: (el) => {
    if (el.tagName === 'A' && el.classList.contains('nook-bookmark')) {
      return {
        url: el.getAttribute('href') ?? '',
        title: el.getAttribute('data-title') ?? '',
        fetched: 0,
      };
    }
    return undefined;
  },
});
