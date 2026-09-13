// Owner: frontend-editor — uploads for the editor (contracts §8). The typed client has
// `api.files.upload`, but it is fetch-based and therefore cannot report progress, so uploads go
// through XHR with the exact same multipart contract (see the report: api-client gap).
import type { Attachment, AttachmentPurpose } from '@nook/api-client';

export interface UploadOptions {
  nodeId: string;
  blockId?: string;
  propertyId?: string;
  purpose?: AttachmentPurpose;
  workspaceId: string;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export class UploadError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'UploadError';
    this.status = status;
  }
}

function describe(status: number, raw: string): string {
  try {
    const body = JSON.parse(raw) as { title?: string; detail?: string };
    return body.title ?? body.detail ?? `Upload failed (${status})`;
  } catch {
    if (status === 413) return 'File is too large';
    return raw || `Upload failed (${status})`;
  }
}

/** `POST /api/files` (multipart) with progress events. */
export function uploadFileWithProgress(file: File | Blob, opts: UploadOptions): Promise<Attachment> {
  return new Promise<Attachment>((resolve, reject) => {
    const form = new FormData();
    form.append('file', file, file instanceof File ? file.name : 'upload');
    form.append('nodeId', opts.nodeId);
    if (opts.blockId) form.append('blockId', opts.blockId);
    if (opts.propertyId) form.append('propertyId', opts.propertyId);
    if (opts.purpose) form.append('purpose', opts.purpose);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/files');
    xhr.withCredentials = true;
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader('X-Workspace-Id', opts.workspaceId);
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) opts.onProgress?.(e.loaded / e.total);
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        opts.onProgress?.(1);
        try {
          resolve(JSON.parse(xhr.responseText) as Attachment);
        } catch {
          reject(new UploadError(xhr.status, 'Malformed upload response'));
        }
      } else {
        reject(new UploadError(xhr.status, describe(xhr.status, xhr.responseText)));
      }
    });
    xhr.addEventListener('error', () => reject(new UploadError(0, 'Network error during upload')));
    xhr.addEventListener('abort', () => reject(new UploadError(0, 'Upload cancelled')));
    opts.signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}
