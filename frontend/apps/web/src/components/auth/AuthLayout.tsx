import type { ReactNode } from 'react';

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg p-6">
      <div className="w-full max-w-[360px]">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <div className="flex size-10 items-center justify-center rounded-[var(--radius)] bg-fg text-lg font-bold text-bg">
            N
          </div>
          <h1 className="text-xl font-semibold text-fg">{title}</h1>
          {subtitle ? <p className="text-sm text-fg-secondary">{subtitle}</p> : null}
        </div>
        {children}
      </div>
    </div>
  );
}
