import { useCallback, useRef, useState } from 'react';
import type { UploadResult } from '@nook/editor';
import { formatBytes } from '@nook/editor';
import { XIcon } from 'lucide-react';
import { uploadFileWithProgress } from './upload';
import { useToastStore } from '../../stores/toast';

export interface UploadItem {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: 'uploading' | 'done' | 'error';
  error?: string;
}

export interface Uploads {
  items: UploadItem[];
  /** Hands the editor the props for the media block (`uploadFile` in BlockNote's options). */
  upload: (file: File, blockId?: string) => Promise<UploadResult>;
  dismiss: (id: string) => void;
}

let seq = 0;

/** Uploads for the page's editor: `POST /api/files` with progress, errors surfaced as toasts. */
export function useUploads(workspaceId: string, nodeId: string): Uploads {
  const [items, setItems] = useState<UploadItem[]>([]);
  const toast = useToastStore((s) => s.push);
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const dismiss = useCallback((id: string) => setItems((list) => list.filter((i) => i.id !== id)), []);

  const upload = useCallback(
    async (file: File, blockId?: string): Promise<UploadResult> => {
      const id = `up-${++seq}`;
      setItems((list) => [...list, { id, name: file.name, size: file.size, progress: 0, status: 'uploading' }]);
      try {
        const attachment = await uploadFileWithProgress(file, {
          nodeId,
          workspaceId,
          ...(blockId ? { blockId } : {}),
          purpose: 'content',
          onProgress: (fraction) => setItems((list) => list.map((i) => (i.id === id ? { ...i, progress: fraction } : i))),
        });
        setItems((list) => list.map((i) => (i.id === id ? { ...i, progress: 1, status: 'done' } : i)));
        window.setTimeout(() => dismiss(id), 1500);
        return {
          url: attachment.url,
          name: attachment.filename,
          attachmentId: attachment.id,
          mime: attachment.mime,
          size: attachment.size,
          ...(attachment.meta.pages ? { pages: attachment.meta.pages } : {}),
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Upload failed';
        setItems((list) => list.map((i) => (i.id === id ? { ...i, status: 'error', error: message } : i)));
        toastRef.current(`${file.name}: ${message}`);
        throw e;
      }
    },
    [nodeId, workspaceId, dismiss],
  );

  return { items, upload, dismiss };
}

/** Bottom-right progress list for in-flight uploads. */
export function UploadProgress({ uploads }: { uploads: Uploads }) {
  if (!uploads.items.length) return null;
  return (
    <div className="nook-uploads" data-testid="upload-progress">
      {uploads.items.map((item) => (
        <div key={item.id} className="nook-uploads__item" data-status={item.status}>
          <div className="nook-uploads__row">
            <span className="nook-uploads__name">{item.name}</span>
            <span className="nook-uploads__size">{formatBytes(item.size)}</span>
            <button type="button" aria-label="Dismiss" onClick={() => uploads.dismiss(item.id)}>
              <XIcon size={12} />
            </button>
          </div>
          {item.status === 'error' ? (
            <div className="nook-uploads__error">{item.error}</div>
          ) : (
            <div className="nook-uploads__bar">
              <div style={{ width: `${Math.round(item.progress * 100)}%` }} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
