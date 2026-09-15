import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@nook/editor', () => ({
  formatBytes: (size: number) => `${size} B`,
}));

import { UploadProgress, type Uploads } from './useUploads';

function uploads(items: Uploads['items']): Uploads {
  return {
    items,
    upload: vi.fn(),
    dismiss: vi.fn(),
  };
}

describe('UploadProgress', () => {
  it('renders uploading, completed and failed states with dismiss actions', () => {
    const value = uploads([
      { id: 'uploading', name: 'photo.png', size: 1024, progress: 0.42, status: 'uploading' },
      { id: 'done', name: 'notes.txt', size: 3, progress: 1, status: 'done' },
      { id: 'failed', name: 'archive.zip', size: 4, progress: 0.2, status: 'error', error: 'Network error' },
    ]);

    render(<UploadProgress uploads={value} />);

    expect(screen.getByTestId('upload-progress')).toBeInTheDocument();
    expect(screen.getByLabelText('Uploading 42 percent')).toBeInTheDocument();
    expect(screen.getByText('Uploaded')).toBeInTheDocument();
    expect(screen.getByText('Network error')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel upload' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Dismiss' })).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel upload' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss' })[0]!);
    expect(value.dismiss).toHaveBeenCalledWith('uploading');
    expect(value.dismiss).toHaveBeenCalledWith('done');
  });

  it('renders nothing when there are no upload items', () => {
    const { container } = render(<UploadProgress uploads={uploads([])} />);
    expect(container).toBeEmptyDOMElement();
  });
});
