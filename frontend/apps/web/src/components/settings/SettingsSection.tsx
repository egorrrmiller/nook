import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@nook/ui';

export function SettingsPageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-xl font-semibold">{title}</h1>
      {description ? <p className="mt-1 text-sm text-fg-muted">{description}</p> : null}
    </div>
  );
}

/** A labelled row: title + description on the left, control on the right (Notion settings style). */
export function SettingsRow({
  title,
  description,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-4 border-b border-border py-3 last:border-0', className)}>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{title}</div>
        {description ? <div className="mt-0.5 text-xs text-fg-muted">{description}</div> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

/** Shared layout for compact settings forms that end with an action button. */
export function SettingsActionRow({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-wrap items-end gap-2 py-3', className)} {...props} />;
}

/** Shared vertical form spacing for settings sections with several fields. */
export function SettingsForm({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-3 py-3', className)} {...props} />;
}

/** Shared list treatment for members, invitations and other settings collections. */
export function SettingsList({ className, ...props }: ComponentProps<'ul'>) {
  return <ul className={cn('flex flex-col', className)} {...props} />;
}

export function SettingsListItem({ className, ...props }: ComponentProps<'li'>) {
  return <li className={cn('flex items-center gap-3 border-b border-border py-2.5 last:border-0', className)} {...props} />;
}

export function SettingsGroup({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      {title ? <h2 className="mb-1 text-xs font-medium tracking-wide text-fg-muted uppercase">{title}</h2> : null}
      <div className="flex flex-col">{children}</div>
    </section>
  );
}
