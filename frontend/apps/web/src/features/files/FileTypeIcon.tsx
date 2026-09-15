import {
  ArchiveIcon,
  FileIcon,
  FileTextIcon,
  ImageIcon,
  MusicIcon,
  VideoIcon,
} from 'lucide-react';
import type { FileKind } from './file-display';

export function FileTypeIcon({ kind }: { kind: FileKind }) {
  if (kind === 'image') return <ImageIcon aria-hidden="true" />;
  if (kind === 'video') return <VideoIcon aria-hidden="true" />;
  if (kind === 'audio') return <MusicIcon aria-hidden="true" />;
  if (kind === 'pdf' || kind === 'text' || kind === 'document') return <FileTextIcon aria-hidden="true" />;
  if (kind === 'archive') return <ArchiveIcon aria-hidden="true" />;
  return <FileIcon aria-hidden="true" />;
}
