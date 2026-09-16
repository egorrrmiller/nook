import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Attachment } from '@nook/api-client';
import { FileAttachmentCard } from './FileAttachmentCard';
import { fileKind, fileTypeLabel, formatFileSize, resourceFromAttachment, resourceFromExternal } from './file-display';

function attachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: 'attachment-1',
    nodeId: 'node-1',
    blockId: null,
    propertyId: null,
    purpose: 'content',
    filename: 'report.pdf',
    mime: 'application/pdf',
    size: 2_048,
    sha256: 'a'.repeat(64),
    url: '/api/files/attachment-1',
    thumbUrl: null,
    meta: {},
    createdAt: '2026-09-14T00:00:00Z',
    ...overrides,
  };
}

describe('file display', () => {
  it('classifies known and unknown MIME types without trusting a missing declaration', () => {
    expect(fileKind({ name: 'photo.png', mime: 'application/octet-stream' })).toBe('image');
    expect(fileKind({ name: 'movie.mp4', mime: 'video/mp4' })).toBe('video');
    expect(fileKind({ name: 'archive.bin', mime: 'application/octet-stream' })).toBe('unknown');
    expect(fileTypeLabel({ name: 'archive.bin', mime: 'application/octet-stream' })).toBe('BIN file');
  });

  it('formats metadata for human-readable cards', () => {
    expect(formatFileSize(2_048)).toBe('2.0 KB');
    expect(formatFileSize(undefined)).toBe('');
    expect(resourceFromExternal({ name: 'clip.webm', url: 'https://cdn.example/clip.webm' }).mime).toBe('video/webm');
  });

  it('uses the isolated browser preview for uploaded SVGs instead of the raster thumbnail', () => {
    const resource = resourceFromAttachment(attachment({ filename: 'diagram.svg', mime: 'image/svg+xml' }));
    expect(resource.previewUrl).toBe('/api/files/attachment-1/preview');
  });

  it('shows MIME, size, safe actions and a PDF preview toggle', () => {
    render(<FileAttachmentCard attachment={attachment()} />);
    expect(screen.getByText('report.pdf')).toBeInTheDocument();
    expect(screen.getByText('PDF · application/pdf')).toBeInTheDocument();
    expect(screen.getByText('2.0 KB')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open file/i })).toHaveAttribute('href', '/api/files/attachment-1');
    expect(screen.getByRole('link', { name: /Download/i })).toHaveAttribute('href', '/api/files/attachment-1?download=1');

    fireEvent.click(screen.getByRole('button', { name: 'Preview file' }));
    expect(screen.getByTestId('file-preview')).toBeInTheDocument();
    expect(within(screen.getByTestId('file-preview')).getByTitle('report.pdf')).toBeInTheDocument();
  });

  it('hands previewing to the side viewer when the host provides it', () => {
    const onPreview = vi.fn();
    render(<FileAttachmentCard attachment={attachment()} onPreview={onPreview} />);
    fireEvent.click(screen.getByRole('button', { name: 'Preview file' }));
    expect(onPreview).toHaveBeenCalledWith(expect.objectContaining({ id: 'attachment-1', mime: 'application/pdf' }));
    expect(screen.queryByTestId('file-preview')).not.toBeInTheDocument();
  });

  it('does not create unsafe external actions and explains the fallback', () => {
    render(<FileAttachmentCard external={{ name: 'weird.bin', url: 'javascript:alert(1)' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('cannot be opened safely');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('keeps unknown files usable while clearly stating that there is no preview', () => {
    render(<FileAttachmentCard attachment={attachment({ filename: 'data.bin', mime: 'application/octet-stream' })} />);
    expect(screen.getByTestId('file-preview-fallback')).toHaveTextContent('Preview is not available');
    expect(screen.getByRole('link', { name: /Open file/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Download/i })).toBeInTheDocument();
  });

  it('keeps removal as an accessible action when a card is editable', () => {
    const onRemove = vi.fn();
    render(<FileAttachmentCard attachment={attachment()} onRemove={onRemove} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove report.pdf' }));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it('shows a recoverable error when a preview cannot load', () => {
    render(<FileAttachmentCard attachment={attachment({ filename: 'photo.png', mime: 'image/png' })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Preview file' }));
    fireEvent.error(screen.getByRole('img', { name: 'photo.png' }));

    expect(screen.getByTestId('file-preview-error')).toHaveTextContent('Preview unavailable');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
