import type { ApiClient, ThumbWidth } from '@nook/api-client';

/** `/api/files/{id}[…]` → attachment id, or null for external URLs. */
export function attachmentIdFromUrl(url: string): string | null {
  const m = /^(?:https?:\/\/[^/]+)?\/api\/files\/([^/?#]+)/.exec(url);
  return m?.[1] ?? null;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

export const THUMB_WIDTHS: readonly ThumbWidth[] = [320, 640, 1280, 1920];

/** Responsive `srcset` for an uploaded image (contracts §8 `thumb?w=`); null for external images. */
export function imageSrcSet(api: ApiClient, url: string): { src: string; srcSet: string; sizes: string } | null {
  const id = attachmentIdFromUrl(url);
  if (!id) return null;
  return {
    src: api.files.thumbUrl(id, 1280),
    srcSet: THUMB_WIDTHS.map((w) => `${api.files.thumbUrl(id, w)} ${w}w`).join(', '),
    sizes: '(max-width: 760px) 100vw, 708px',
  };
}

export const IMAGE_MIME = /^image\//;
export const VIDEO_MIME = /^video\//;
export const AUDIO_MIME = /^audio\//;

export function blockTypeForFile(file: { type: string; name: string }): 'image' | 'video' | 'audio' | 'pdf' | 'file' {
  if (IMAGE_MIME.test(file.type)) return 'image';
  if (VIDEO_MIME.test(file.type)) return 'video';
  if (AUDIO_MIME.test(file.type)) return 'audio';
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return 'pdf';
  return 'file';
}
