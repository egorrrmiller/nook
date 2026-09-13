import type { ReactNode } from 'react';
import { cn } from '@nook/ui';

export function EmptyState({ icon, title, hint, className }: { icon?: ReactNode; title: string; hint?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center gap-1 px-4 py-8 text-center', className)}>
      {icon ? <div className="mb-1 text-muted-foreground [&_svg]:size-6">{icon}</div> : null}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint ? <p className="max-w-xs text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
