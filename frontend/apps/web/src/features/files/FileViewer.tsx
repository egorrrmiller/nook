import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  Loader2Icon,
  RefreshCwIcon,
} from 'lucide-react';
import { Button } from '@nook/ui';
import { api } from '../../lib/api';
import { toast } from '../../stores/toast';
import type { FilePreviewTarget } from '../../stores/ui';
import {
  downloadUrl,
  fileKind,
  formatFileSize,
  resourceFromAttachment,
  type FileResource,
} from './file-display';
import { FileTypeIcon } from './FileTypeIcon';

const PdfWorkbench = lazy(() =>
  import('./PdfWorkbench').then((module) => ({ default: module.PdfWorkbench })),
);

function pageFromHash(): number {
  if (typeof window === 'undefined') return 1;
  const value = Number.parseInt(
    new URLSearchParams(window.location.hash.slice(1)).get('page') ?? '',
    10,
  );
  return Number.isFinite(value) && value > 0 ? value : 1;
}

/** Right-hand file workbench. The page editor stays active, so the user can take notes beside it. */
export function FileViewer({
  target,
  pageLinkBase,
}: {
  target: FilePreviewTarget;
  pageLinkBase?: string;
}) {
  const [page, setPage] = useState(() => (pageLinkBase ? pageFromHash() : 1));
  const attachment = useQuery({
    queryKey: ['file-meta', target.id],
    queryFn: ({ signal }) => api.files.meta(target.id, signal),
  });

  useEffect(() => {
    const sync = () => setPage(pageLinkBase ? pageFromHash() : 1);
    sync();
    if (!pageLinkBase) return;
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [target.id, pageLinkBase]);

  const selectPage = useCallback((next: number) => {
    setPage(next);
    if (pageLinkBase) window.history.replaceState(null, '', `${pageLinkBase}#page=${next}`);
  }, [pageLinkBase]);

  const copyPageLink = async () => {
    if (!pageLinkBase) return;
    const link = new URL(`${pageLinkBase}#page=${page}`, window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(link);
      toast(`Link to page ${page} copied`);
    } catch {
      toast('Could not copy the page link', 'error');
    }
  };

  const resource = useMemo<FileResource>(() => {
    if (attachment.data) return resourceFromAttachment(attachment.data);
    return {
      id: target.id,
      name: target.name || 'File',
      mime: target.mime || 'application/octet-stream',
      url: target.url || api.files.url(target.id),
      ...(target.mime?.toLowerCase() === 'image/svg+xml'
        ? { previewUrl: api.files.previewUrl(target.id) }
        : {}),
    };
  }, [attachment.data, target]);
  const kind = fileKind(resource);
  const previewSource = resource.previewUrl || resource.url;

  return (
    <div
      className={`nook-file-viewer${pageLinkBase ? ' nook-file-viewer--node' : ''}`}
      data-testid="file-viewer"
    >
      <header className="nook-file-viewer__header">
        <span className="nook-file-viewer__icon">
          <FileTypeIcon kind={kind} />
        </span>
        <div>
          <strong>{resource.name}</strong>
          <span>
            {resource.mime}
            {resource.size !== undefined ? ` · ${formatFileSize(resource.size)}` : ''}
            {resource.meta?.pages ? ` · ${resource.meta.pages} pages` : ''}
          </span>
        </div>
        <a href={resource.url} target="_blank" rel="noreferrer" title="Open file">
          <ExternalLinkIcon />
        </a>
        {kind === 'pdf' && pageLinkBase ? (
          <button
            type="button"
            title={`Copy link to page ${page}`}
            onClick={() => void copyPageLink()}
          >
            <CopyIcon />
          </button>
        ) : null}
        <a href={downloadUrl(resource)} download title="Download file">
          <DownloadIcon />
        </a>
      </header>

      {attachment.isPending ? (
        <div className="nook-file-viewer__state">
          <Loader2Icon className="nook-file-card__spinner" /> Loading file…
        </div>
      ) : null}
      {attachment.isError ? (
        <div className="nook-file-viewer__state nook-file-viewer__state--error">
          File metadata could not be loaded.
          <Button variant="link" size="xs" onClick={() => void attachment.refetch()}>
            <RefreshCwIcon /> Retry
          </Button>
        </div>
      ) : null}

      {kind === 'pdf' ? (
        <Suspense
          fallback={
            <div className="nook-file-viewer__state">
              <Loader2Icon className="nook-file-viewer__spin" /> Loading PDF viewer…
            </div>
          }
        >
          <PdfWorkbench
            id={target.id}
            src={resource.url}
            name={resource.name}
            initialPage={page}
            onPageChange={selectPage}
          />
        </Suspense>
      ) : null}
      {kind === 'image' ? (
        <img className="nook-file-viewer__image" src={previewSource} alt={resource.name} />
      ) : null}
      {kind === 'video' ? (
        <video className="nook-file-viewer__media" controls src={resource.url} />
      ) : null}
      {kind === 'audio' ? (
        <audio className="nook-file-viewer__audio" controls src={resource.url} />
      ) : null}
      {kind === 'text' ? (
        <iframe
          className="nook-file-viewer__document nook-file-viewer__document--text"
          src={resource.url}
          title={resource.name}
        />
      ) : null}

    </div>
  );
}
