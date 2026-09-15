import type { ReactNode } from 'react';
import { Button, type ButtonProps } from './button';
import { cn } from '../lib/cn';

export interface ToggleButtonProps extends Omit<ButtonProps, 'children' | 'aria-pressed'> {
  /** Whether the control is currently selected. */
  pressed: boolean;
  children: ReactNode;
}

/** A compact pill-shaped button for filters, scopes and other binary controls. */
export function ToggleButton({ pressed, className, variant = 'ghost', size = 'sm', ...props }: ToggleButtonProps) {
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      aria-pressed={pressed}
      className={cn(
        'rounded-full border border-border text-muted-foreground hover:bg-accent hover:text-foreground',
        pressed && 'border-primary/40 bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-foreground',
        className,
      )}
      {...props}
    />
  );
}
