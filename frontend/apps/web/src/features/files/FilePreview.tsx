import { Loader2Icon } from 'lucide-react';
import type { FileKind, FileResource } from './file-display';

export interface FilePreviewProps {
  resource: FileResource;
  kind: FileKind;
  originalImage: boolean;
  loaded: boolean;
  onLoaded: () => void;
  onError: () => void;
  onImageError: () => void;
}

/** The MIME-specific preview surface used by attachment cards. */
export function FilePreview({
  resource,
  kind,
  originalImage,
  loaded,
  onLoaded,
  onError,
  onImageError,
}: FilePreviewProps) {
  if (!['image', 'video', 'audio', 'pdf'].includes(kind)) return null;
  const className = `nook-file-card__preview${kind === 'audio' ? ' nook-file-card__preview--audio' : ''}${kind === 'pdf' ? ' nook-file-card__preview--pdf' : ''}`;
  const source = resource.previewUrl || (originalImage ? resource.url : resource.thumbUrl || resource.url);

  return (
    <div className={className} data-testid="file-preview">
      {!loaded ? <Loader2Icon className="nook-file-card__spinner" aria-label="Loading preview" /> : null}
      {kind === 'image' ? (
        <img
          src={source}
          alt={resource.name}
          loading="lazy"
          onLoad={onLoaded}
          onError={onImageError}
        />
      ) : null}
      {kind === 'video' ? (
        <video controls preload="metadata" onLoadedData={onLoaded} onError={onError}>
          <source src={resource.url} type={resource.mime} />
        </video>
      ) : null}
      {kind === 'audio' ? (
        <audio controls preload="metadata" onLoadedData={onLoaded} onError={onError}>
          <source src={resource.url} type={resource.mime} />
        </audio>
      ) : null}
      {kind === 'pdf' ? <iframe src={resource.url} title={resource.name} onLoad={onLoaded} onError={onError} /> : null}
    </div>
  );
}
