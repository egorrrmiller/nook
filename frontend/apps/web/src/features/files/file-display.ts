import type { Attachment } from '@nook/api-client';

export type FileKind = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'archive' | 'document' | 'unknown';

export interface ExternalFile {
  name: string;
  url: string;
  mime?: string;
  size?: number;
}

export interface FileResource {
  id?: string;
  name: string;
  url: string;
  mime: string;
  size?: number;
  thumbUrl?: string | null;
  meta?: Attachment['meta'];
  external?: boolean;
}

const EXTENSION_MIME: Record<string, string> = {
  avif: 'image/avif',
  bmp: 'image/bmp',
  csv: 'text/csv',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  gif: 'image/gif',
  heic: 'image/heic',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  json: 'application/json',
  markdown: 'text/markdown',
  md: 'text/markdown',
  mkv: 'video/x-matroska',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  pdf: 'application/pdf',
  png: 'image/png',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  svg: 'image/svg+xml',
  txt: 'text/plain',
  wav: 'audio/wav',
  webm: 'video/webm',
  webp: 'image/webp',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xml: 'application/xml',
  zip: 'application/zip',
};

export function resourceFromAttachment(attachment: Attachment): FileResource {
  return {
    id: attachment.id,
    name: attachment.filename,
    url: attachment.url,
    mime: attachment.mime,
    size: attachment.size,
    thumbUrl: attachment.thumbUrl,
    meta: attachment.meta,
  };
}

export function resourceFromExternal(file: ExternalFile): FileResource {
  return {
    name: file.name || 'External file',
    url: file.url,
    mime: file.mime || mimeFromName(file.name),
    ...(file.size === undefined ? {} : { size: file.size }),
    external: true,
  };
}

export function mimeFromName(name: string): string {
  const cleanName = name.split(/[?#]/, 1)[0] ?? name;
  const match = /\.([a-z0-9]+)$/i.exec(cleanName);
  return match ? EXTENSION_MIME[match[1]!.toLowerCase()] ?? 'application/octet-stream' : 'application/octet-stream';
}

export function fileKind(resource: Pick<FileResource, 'name' | 'mime'>): FileKind {
  const mime = resource.mime.toLowerCase().split(';', 1)[0]!.trim();
  const effectiveMime = mime === 'application/octet-stream' ? mimeFromName(resource.name) : mime;
  if (effectiveMime.startsWith('image/')) return 'image';
  if (effectiveMime.startsWith('video/')) return 'video';
  if (effectiveMime.startsWith('audio/')) return 'audio';
  if (effectiveMime === 'application/pdf') return 'pdf';
  if (effectiveMime.startsWith('text/') || effectiveMime === 'application/json' || effectiveMime === 'application/xml') return 'text';
  if (effectiveMime.includes('zip') || effectiveMime.includes('compressed') || effectiveMime.includes('archive')) return 'archive';
  if (effectiveMime.includes('word') || effectiveMime.includes('excel') || effectiveMime.includes('powerpoint') || effectiveMime.includes('officedocument')) {
    return 'document';
  }
  return 'unknown';
}

export function fileTypeLabel(resource: Pick<FileResource, 'name' | 'mime'>): string {
  const kind = fileKind(resource);
  if (kind === 'image') return 'Image';
  if (kind === 'video') return 'Video';
  if (kind === 'audio') return 'Audio';
  if (kind === 'pdf') return 'PDF';
  if (kind === 'text') return 'Text';
  if (kind === 'archive') return 'Archive';
  if (kind === 'document') return 'Document';
  const extension = /\.([a-z0-9]+)$/i.exec(resource.name)?.[1];
  return extension ? `${extension.toUpperCase()} file` : 'Unknown file';
}

export function formatFileSize(size: number | undefined): string {
  if (size === undefined || !Number.isFinite(size) || size < 0) return '';
  if (size < 1024) return `${size} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = size / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

export function isSafeFileUrl(raw: string): boolean {
  if (raw.startsWith('/')) return true;
  try {
    const url = new URL(raw, typeof window === 'undefined' ? 'http://localhost' : window.location.origin);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function downloadUrl(resource: Pick<FileResource, 'url' | 'id' | 'external'>): string {
  if (resource.external || !resource.id) return resource.url;
  return resource.url.includes('?') ? `${resource.url}&download=1` : `${resource.url}?download=1`;
}

export function metadataLabel(resource: FileResource): string[] {
  const labels: string[] = [];
  if (resource.size !== undefined) {
    const size = formatFileSize(resource.size);
    if (size) labels.push(size);
  }
  if (resource.meta?.width && resource.meta.height) labels.push(`${resource.meta.width} × ${resource.meta.height}`);
  if (resource.meta?.pages) labels.push(`${resource.meta.pages} ${resource.meta.pages === 1 ? 'page' : 'pages'}`);
  if (resource.meta?.duration) labels.push(formatDuration(resource.meta.duration));
  return labels;
}

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, '0')}`;
}
