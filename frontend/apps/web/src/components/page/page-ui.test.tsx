import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { NodeCover } from '@nook/api-client';
import { PageCover } from './PageCover';
import { PageToolbar } from './PageToolbar';

vi.mock('../pickers', () => ({
  CoverPicker: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

describe('PageToolbar', () => {
  it('exposes the current presentation mode and keeps every control accessible', () => {
    const onToggleReadMode = vi.fn();
    const onToggleFocusMode = vi.fn();
    const onToggleInspector = vi.fn();

    render(
      <PageToolbar
        mode="edit"
        inspectorOpen={false}
        onToggleReadMode={onToggleReadMode}
        onToggleFocusMode={onToggleFocusMode}
        onToggleInspector={onToggleInspector}
      />,
    );

    expect(screen.getByRole('toolbar', { name: 'Page view controls' })).toBeInTheDocument();
    expect(screen.getByText('Editing')).toBeInTheDocument();
    expect(screen.getByTestId('toggle-read-mode')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('toggle-focus-mode')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('toggle-inspector')).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByTestId('toggle-read-mode'));
    fireEvent.click(screen.getByTestId('toggle-focus-mode'));
    fireEvent.click(screen.getByTestId('toggle-inspector'));

    expect(onToggleReadMode).toHaveBeenCalledOnce();
    expect(onToggleFocusMode).toHaveBeenCalledOnce();
    expect(onToggleInspector).toHaveBeenCalledOnce();
  });

  it('labels read and focus states correctly', () => {
    const props = {
      onToggleReadMode: vi.fn(),
      onToggleFocusMode: vi.fn(),
      onToggleInspector: vi.fn(),
    };
    const { rerender } = render(<PageToolbar {...props} mode="read" inspectorOpen />);

    expect(screen.getByText('Reading')).toBeInTheDocument();
    expect(screen.getByTestId('toggle-read-mode')).toHaveAccessibleName('Exit read mode');
    expect(screen.getByTestId('toggle-read-mode')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('toggle-inspector')).toHaveAttribute('aria-pressed', 'true');

    rerender(<PageToolbar {...props} mode="focus" inspectorOpen={false} />);
    expect(screen.getByText('Focus')).toBeInTheDocument();
    expect(screen.getByTestId('toggle-focus-mode')).toHaveAccessibleName('Exit focus mode');
    expect(screen.getByTestId('toggle-focus-mode')).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('PageCover', () => {
  it('keeps cover actions component-backed and hides them in read-only mode', () => {
    const onChange = vi.fn<(cover: NodeCover | null) => void>();
    const cover: NodeCover = { type: 'url', value: 'https://example.com/cover.jpg', position: 0.5 };
    const { rerender } = render(
      <PageCover cover={cover} nodeId="node-1" onChange={onChange} />,
    );

    expect(screen.getByTestId('change-cover')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('remove-cover'));
    expect(onChange).toHaveBeenCalledWith(null);

    rerender(<PageCover cover={cover} nodeId="node-1" readOnly onChange={onChange} />);
    expect(screen.queryByTestId('change-cover')).not.toBeInTheDocument();
    expect(screen.queryByTestId('remove-cover')).not.toBeInTheDocument();
  });
});
