import { describe, expect, it } from 'vitest';
import { movePagePickerActiveIndex } from './PagePicker';

describe('movePagePickerActiveIndex', () => {
  it('clamps navigation to the available results', () => {
    expect(movePagePickerActiveIndex(0, 3, 'previous')).toBe(0);
    expect(movePagePickerActiveIndex(1, 3, 'next')).toBe(2);
    expect(movePagePickerActiveIndex(2, 3, 'next')).toBe(2);
    expect(movePagePickerActiveIndex(0, 0, 'next')).toBe(0);
  });
});
