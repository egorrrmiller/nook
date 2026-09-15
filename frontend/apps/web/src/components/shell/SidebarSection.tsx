import { ChevronRightIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button, cn } from '@nook/ui';
import { useUiStore } from '../../stores/ui';

export interface SidebarSectionProps {
  id: string;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  testId?: string;
}

/** Collapsible sidebar section with one consistent heading/action affordance. */
export function SidebarSection({ id, title, children, action, testId }: SidebarSectionProps) {
  const collapsed = useUiStore((s) => !!s.collapsedSections[id]);
  const toggleSection = useUiStore((s) => s.toggleSection);

  return (
    <section className="nook-sidebar-section mt-3" data-testid={testId} data-collapsed={collapsed}>
      <div className="group flex h-8 items-center gap-1 pr-2 pl-3">
        <Button
          type="button"
          variant="ghost"
          size="md"
          onClick={() => toggleSection(id)}
          aria-expanded={!collapsed}
          className="h-8 justify-start gap-1 rounded-[var(--radius-md)] px-2 text-[12px] font-semibold tracking-[0.01em] text-fg-muted aria-expanded:bg-transparent hover:bg-bg-hover hover:text-fg-secondary"
        >
          <span>{title}</span>
          <ChevronRightIcon
            className={cn(
              'size-3.5 opacity-0 transition-[transform,opacity] duration-[var(--duration)] group-hover:opacity-100',
              !collapsed && 'rotate-90',
            )}
          />
        </Button>
        <span className="ml-auto flex items-center gap-1 opacity-0 transition-opacity duration-[var(--duration)] group-hover:opacity-100 focus-within:opacity-100">
          {action}
        </span>
      </div>
      {!collapsed ? <div className="pt-1">{children}</div> : null}
    </section>
  );
}
