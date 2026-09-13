import { useToastStore } from '../../stores/toast';

export function Toasts() {
  const toasts = useToastStore((s) => s.toasts);
  if (!toasts.length) return null;
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="pointer-events-auto rounded-[var(--radius)] bg-[rgb(15,15,15)] px-3 py-2 text-sm text-white shadow-[var(--shadow)]"
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
