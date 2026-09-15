import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Checkbox, Radio, Toolbar, ToggleButton } from '@nook/ui';

describe('shared UI primitives', () => {
  it('exposes toggle state through aria-pressed and forwards clicks', () => {
    const onClick = vi.fn();
    render(
      <ToggleButton pressed onClick={onClick}>
        Filters
      </ToggleButton>,
    );

    const button = screen.getByRole('button', { name: 'Filters' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders native checkbox and radio controls', () => {
    render(
      <>
        <Checkbox aria-label="Include files" />
        <Radio name="target" value="root" aria-label="Workspace root" />
      </>,
    );

    expect(screen.getByRole('checkbox', { name: 'Include files' })).toHaveAttribute('data-slot', 'checkbox');
    expect(screen.getByRole('radio', { name: 'Workspace root' })).toHaveAttribute('data-slot', 'radio');
  });

  it('provides a toolbar landmark', () => {
    render(<Toolbar aria-label="Page actions">Actions</Toolbar>);
    expect(screen.getByRole('toolbar', { name: 'Page actions' })).toHaveTextContent('Actions');
  });
});
