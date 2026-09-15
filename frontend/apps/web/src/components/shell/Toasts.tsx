import { useToastStore } from '../../stores/toast';
import { InfoIcon, TriangleAlertIcon, XIcon } from 'lucide-react';
import { cn, IconButton } from '@nook/ui';

export function Toasts() {
  const toasts = useToastStore((s) => s.toasts);
  if (!toasts.length) return null;
  return (
    <div
      aria-live="polite"
      className="nook-toasts pointer-events-none fixed bottom-5 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === 'error' ? 'alert' : 'status'}
          aria-atomic="true"
          data-testid="toast"
          className={cn('nook-toast pointer-events-auto flex max-w-[min(420px,calc(100vw-32px))] items-start gap-2 rounded-[var(--radius-md)] border px-3 py-2.5 text-sm shadow-[var(--shadow)]', t.kind === 'error' ? 'nook-toast--error' : 'nook-toast--info')}
        >
          {t.kind === 'error' ? <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" /> : <InfoIcon className="mt-0.5 size-4 shrink-0" />}
          <span className="min-w-0 flex-1 break-words">{t.message}</span>
          <IconButton
            label="Dismiss notification"
            tooltip={false}
            size="icon-sm"
            onClick={() => useToastStore.getState().dismiss(t.id)}
            className="nook-toast__dismiss -mr-1 -mt-1 rounded-sm p-1"
          >
            <XIcon className="size-3.5" />
          </IconButton>
        </div>
      ))}
    </div>
  );
}
