import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Attachment } from '@nook/api-client';
import {
  DownloadIcon,
  ExternalLinkIcon,
  EyeIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react';
import { Button, IconButton, buttonVariants, cn } from '@nook/ui';
import {
  downloadUrl,
  fileKind,
  fileTypeLabel,
  formatFileSize,
  isSafeFileUrl,
  metadataLabel,
  resourceFromAttachment,
  resourceFromExternal,
  type ExternalFile,
  type FileResource,
} from './file-display';
import { FilePreview } from './FilePreview';
import { FileTypeIcon } from './FileTypeIcon';

export interface FileAttachmentCardProps {
  attachment?: Attachment;
  external?: ExternalFile;
  compact?: boolean;
  onRemove?: () => void;
}

function FileActionLink({
  href,
  children,
  download,
  newWindow = false,
}: {
  href: string;
  children: ReactNode;
  download?: boolean;
  newWindow?: boolean;
}) {
  return (
    <a
      href={href}
      {...(newWindow ? { target: '_blank', rel: 'noreferrer' } : {})}
      {...(download ? { download: true } : {})}
      className={cn(buttonVariants({ variant: 'subtle', size: 'xs' }), 'nook-file-card__action-link')}
    >
      {children}
    </a>
  );
}

/** A safe, app-owned attachment card used in the page inspector and file surfaces. */
export function FileAttachmentCard({ attachment, external, compact = false, onRemove }: FileAttachmentCardProps) {
  const resource = useMemo<FileResource | null>(() => {
    if (attachment) return resourceFromAttachment(attachment);
    if (external) return resourceFromExternal(external);
    return null;
  }, [attachment, external]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [useOriginalImage, setUseOriginalImage] = useState(false);

  useEffect(() => {
    setUseOriginalImage(false);
    setPreviewError(null);
    setPreviewLoaded(false);
  }, [resource?.url, resource?.thumbUrl]);

  if (!resource) return null;
  const kind = fileKind(resource);
  const safe = isSafeFileUrl(resource.url);
  const canPreview = safe && (kind === 'image' || kind === 'video' || kind === 'audio' || kind === 'pdf');
  const metadata = metadataLabel(resource);
  const size = formatFileSize(resource.size);
  const openLabel = resource.external ? 'Open external file' : 'Open file';
  const previewLabel = previewOpen ? 'Hide preview' : 'Preview file';

  return (
    <article className={`nook-file-card${compact ? ' nook-file-card--compact' : ''}`} data-testid="file-attachment-card" data-kind={kind}>
      <div className="nook-file-card__header">
        <span className="nook-file-card__icon" title={resource.mime || 'Unknown MIME type'}>
          <FileTypeIcon kind={kind} />
        </span>
        <div className="nook-file-card__identity">
          <strong className="nook-file-card__name" title={resource.name}>{resource.name || 'Unnamed file'}</strong>
          <span className="nook-file-card__type" title={resource.mime || 'application/octet-stream'}>
            {fileTypeLabel(resource)} · {resource.mime || 'application/octet-stream'}
          </span>
        </div>
        {onRemove ? (
          <IconButton
            label={`Remove ${resource.name}`}
            tooltip={false}
            variant="subtle"
            size="icon-sm"
            className="nook-file-card__icon-button"
            onClick={onRemove}
          >
            <Trash2Icon aria-hidden="true" />
          </IconButton>
        ) : null}
      </div>

      {metadata.length ? <div className="nook-file-card__meta">{metadata.join(' · ')}</div> : size ? <div className="nook-file-card__meta">{size}</div> : null}

      {!safe ? (
        <div className="nook-file-card__fallback" role="alert">
          <FileTypeIcon kind="unknown" />
          <span>This file URL cannot be opened safely.</span>
        </div>
      ) : previewError ? (
        <div className="nook-file-card__fallback" role="alert" data-testid="file-preview-error">
          <FileTypeIcon kind={kind} />
          <span>Preview unavailable. You can still open or download the file.</span>
          <Button
            type="button"
            variant="link"
            size="xs"
            onClick={() => { setPreviewError(null); setPreviewLoaded(false); setUseOriginalImage(false); }}
          >
            Try again
          </Button>
        </div>
      ) : !canPreview ? (
        <div className="nook-file-card__fallback" data-testid="file-preview-fallback">
          <FileTypeIcon kind={kind} />
          <span>Preview is not available for this file type.</span>
        </div>
      ) : null}

      {safe && previewOpen && !previewError && canPreview ? (
        <FilePreview
          resource={resource}
          kind={kind}
          originalImage={useOriginalImage}
          loaded={previewLoaded}
          onLoaded={() => setPreviewLoaded(true)}
          onError={() => setPreviewError(kind)}
          onImageError={() => {
            if (resource.thumbUrl && !useOriginalImage) {
              setUseOriginalImage(true);
              setPreviewLoaded(false);
            } else {
              setPreviewError('image');
            }
          }}
        />
      ) : null}

      <div className="nook-file-card__actions">
        {canPreview ? (
          <Button
            type="button"
            variant="subtle"
            size="xs"
            onClick={() => { setPreviewOpen((open) => !open); setPreviewError(null); setPreviewLoaded(false); setUseOriginalImage(false); }}
            aria-label={previewLabel}
          >
            {previewOpen ? <XIcon aria-hidden="true" /> : <EyeIcon aria-hidden="true" />}
            {previewOpen ? 'Hide preview' : 'Preview'}
          </Button>
        ) : null}
        {safe ? (
          <FileActionLink href={resource.url} newWindow>
            <ExternalLinkIcon aria-hidden="true" /> {openLabel}
          </FileActionLink>
        ) : null}
        {safe ? (
          <FileActionLink href={downloadUrl(resource)} download={!resource.external || undefined}>
            <DownloadIcon aria-hidden="true" /> Download
          </FileActionLink>
        ) : null}
      </div>
      {resource.external ? <div className="nook-file-card__external"><ExternalLinkIcon aria-hidden="true" /> External URL</div> : null}
    </article>
  );
}
