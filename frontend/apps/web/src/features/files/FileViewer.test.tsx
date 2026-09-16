import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Attachment } from '@nook/api-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { FileViewer } from './FileViewer';

vi.mock('./PdfWorkbench', () => ({
  PdfWorkbench: ({
    src,
    initialPage,
    onPageChange,
  }: {
    src: string;
    initialPage: number;
    onPageChange?: (page: number) => void;
  }) => (
    <div data-testid="pdf-workbench" data-src={src} data-initial-page={initialPage}>
      <button type="button" onClick={() => onPageChange?.(2)}>
        Show page 2
      </button>
    </div>
  ),
}));

vi.mock('../../lib/api', () => ({
  api: {
    files: {
      meta: vi.fn(),
      text: vi.fn(),
      url: (id: string) => `/api/files/${id}`,
      previewUrl: (id: string) => `/api/files/${id}/preview`,
    },
  },
}));

const pdf: Attachment = {
  id: 'file-1',
  nodeId: 'node-1',
  blockId: null,
  propertyId: null,
  purpose: 'content',
  filename: 'report.pdf',
  mime: 'application/pdf',
  size: 1_024,
  sha256: 'a'.repeat(64),
  url: '/api/files/file-1',
  thumbUrl: null,
  meta: { pages: 2, textExtracted: true },
  createdAt: '2026-09-16T00:00:00Z',
};

describe('FileViewer', () => {
  beforeEach(() => {
    vi.mocked(api.files.meta).mockResolvedValue(pdf);
    vi.mocked(api.files.text).mockResolvedValue({
      text: 'First\nSecond',
      pages: [
        { page: 1, text: 'First' },
        { page: 2, text: 'Second' },
      ],
      ready: true,
      succeeded: true,
    });
  });

  it('opens PDFs in the custom workbench without rendering extracted text below it', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <FileViewer target={{ id: pdf.id, name: pdf.filename, mime: pdf.mime, url: pdf.url }} />
      </QueryClientProvider>,
    );

    const workbench = await screen.findByTestId('pdf-workbench');
    expect(workbench).toHaveAttribute('data-src', '/api/files/file-1');
    expect(workbench).toHaveAttribute('data-initial-page', '1');
    expect(screen.queryByText('Recognized text')).not.toBeInTheDocument();
    expect(api.files.text).not.toHaveBeenCalled();
  });

  it('opens a PDF page from the file-node hash and exposes a stable page link', async () => {
    window.history.replaceState(null, '', '/w/ws/p/node-1#page=2');
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <FileViewer
          target={{ id: pdf.id, name: pdf.filename, mime: pdf.mime, url: pdf.url }}
          pageLinkBase="/w/ws/p/node-1"
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId('pdf-workbench')).toHaveAttribute('data-initial-page', '2');
    fireEvent.click(screen.getByRole('button', { name: 'Show page 2' }));
    expect(window.location.hash).toBe('#page=2');
    expect(screen.getByTitle('Copy link to page 2')).toBeInTheDocument();
  });
});
