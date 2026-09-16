import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HiddenFileInput } from './HiddenFileInput';

describe('HiddenFileInput', () => {
  it('forwards one file and resets the input for repeat selections', () => {
    const onFile = vi.fn();
    render(<HiddenFileInput accept=".txt" aria-label="Choose file" onFile={onFile} />);
    const input = screen.getByLabelText('Choose file') as HTMLInputElement;
    const file = new File(['notes'], 'notes.txt', { type: 'text/plain' });

    fireEvent.change(input, { target: { files: [file] } });

    expect(onFile).toHaveBeenCalledWith(file);
    expect(input.value).toBe('');
  });

  it('forwards every selected file for tree uploads', () => {
    const onFiles = vi.fn();
    render(<HiddenFileInput multiple aria-label="Choose files" onFiles={onFiles} />);
    const files = [new File(['a'], 'a.pdf'), new File(['b'], 'b.pdf')];

    fireEvent.change(screen.getByLabelText('Choose files'), { target: { files } });

    expect(onFiles).toHaveBeenCalledWith(files);
  });
});
