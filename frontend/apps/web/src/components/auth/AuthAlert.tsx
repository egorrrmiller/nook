import type { ReactNode } from 'react';

/** Consistent, announced error surface shared by the sign-in and registration forms. */
export function AuthAlert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-[var(--radius-sm)] bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {children}
    </p>
  );
}
