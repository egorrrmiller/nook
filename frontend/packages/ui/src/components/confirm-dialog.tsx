import { AlertDialog as AlertDialogPrimitive } from '@base-ui/react/alert-dialog';
import { useState, type ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Button } from './button';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `destructive` renders a red confirm button. */
  variant?: 'default' | 'destructive';
  onConfirm: () => void | Promise<void>;
  className?: string;
}

/** Modal confirmation (Base UI AlertDialog): Esc / backdrop do NOT dismiss; Cancel does. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  className,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Backdrop className="fixed inset-0 z-[60] bg-black/40" />
        <AlertDialogPrimitive.Popup
          className={cn(
            'fixed top-1/2 left-1/2 z-[60] flex w-full max-w-sm -translate-x-1/2 -translate-y-1/2 flex-col gap-2 rounded-lg bg-popover p-5 text-popover-foreground outline-none [box-shadow:var(--shadow-dialog)]',
            className,
          )}
        >
          <AlertDialogPrimitive.Title className="text-base font-semibold">{title}</AlertDialogPrimitive.Title>
          {description ? (
            <AlertDialogPrimitive.Description className="text-sm text-muted-foreground">
              {description}
            </AlertDialogPrimitive.Description>
          ) : null}
          <div className="mt-3 flex justify-end gap-2">
            <AlertDialogPrimitive.Close render={<Button variant="outline" size="sm" />}>
              {cancelLabel}
            </AlertDialogPrimitive.Close>
            <Button
              size="sm"
              variant={variant === 'destructive' ? 'destructive' : 'default'}
              disabled={busy}
              data-testid="confirm-dialog-confirm"
              onClick={async () => {
                setBusy(true);
                try {
                  await onConfirm();
                  onOpenChange(false);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </AlertDialogPrimitive.Popup>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
