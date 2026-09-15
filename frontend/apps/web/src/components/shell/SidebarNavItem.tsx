import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Button, cn } from '@nook/ui';

export interface SidebarNavItemProps {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  href?: string;
  trailing?: ReactNode;
  testId?: string;
  exact?: boolean;
  /** Route owned by another slice and not present in the generated route tree. */
  external?: boolean;
}

const navItemClass =
  'group flex h-9 w-full items-center gap-3 rounded-[var(--radius-md)] px-3 text-left text-[13px] font-normal text-sidebar-foreground transition-[background,color,transform] duration-[var(--duration)] hover:bg-bg-hover hover:text-fg active:scale-[0.99] [&.active]:bg-bg-active [&.active]:font-medium [&.active]:text-fg';

/** Shared sidebar navigation row. Links stay semantic links; actions use the UI Button primitive. */
export function SidebarNavItem({
  icon: Icon,
  label,
  onClick,
  href,
  trailing,
  testId,
  exact = true,
  external,
}: SidebarNavItemProps) {
  const inner = (
    <>
      <span className="flex size-6 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-fg-muted transition-colors group-hover:text-fg-secondary">
        <Icon className="size-[18px]" strokeWidth={1.8} />
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
    </>
  );

  if (href && external) {
    return (
      <a href={href} className={navItemClass} data-testid={testId}>
        {inner}
      </a>
    );
  }
  if (href) {
    return (
      <Link to={href} className={navItemClass} activeOptions={{ exact }} data-testid={testId}>
        {inner}
      </Link>
    );
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="lg"
      onClick={onClick}
      className={cn(navItemClass, 'justify-start')}
      data-testid={testId}
    >
      {inner}
    </Button>
  );
}
