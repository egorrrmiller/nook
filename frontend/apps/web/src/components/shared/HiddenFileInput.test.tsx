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
});
