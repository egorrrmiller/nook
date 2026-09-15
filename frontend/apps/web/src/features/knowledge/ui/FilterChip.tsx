import type { ReactNode } from 'react';
import { ToggleButton, cn } from '@nook/ui';

/** Shared compact control used by knowledge filters and graph controls. */
export const filterChipClass =
  'inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-border px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-popup-open:bg-accent [&_svg]:size-3';
export const filterChipActive = 'border-primary/40 bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-foreground';

export function FilterChip({
  active = false,
  onClick,
  children,
  testId,
  title,
  className,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  testId?: string;
  title?: string;
  className?: string;
}) {
  return (
    <ToggleButton
      pressed={active}
      onClick={onClick}
      title={title}
      data-testid={testId}
      className={cn(filterChipClass, active && filterChipActive, className)}
    >
      {children}
    </ToggleButton>
  );
}
