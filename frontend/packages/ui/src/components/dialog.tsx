import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { XIcon } from 'lucide-react';
import { cn } from '../lib/cn';

export function Dialog(props: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root {...props} />;
}

export function DialogTrigger(props: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger {...props} />;
}

export const DialogClose = DialogPrimitive.Close;

export interface DialogContentProps extends DialogPrimitive.Popup.Props {
  showClose?: boolean;
}

export function DialogContent({ className, children, showClose = true, ...props }: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/40 data-open:animate-in data-open:fade-in-0" />
      <DialogPrimitive.Popup
        className={cn(
          'fixed top-1/2 left-1/2 z-50 flex w-full max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-lg bg-popover p-5 text-popover-foreground outline-none [box-shadow:var(--shadow-dialog)]',
          className,
        )}
        {...props}
      >
        {children}
        {showClose ? (
          <DialogPrimitive.Close
            aria-label="Close"
            className="absolute top-3 right-3 rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <XIcon className="size-4" />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

export function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return <DialogPrimitive.Title className={cn('text-base font-semibold', className)} {...props} />;
}

export function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return <DialogPrimitive.Description className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('mt-2 flex justify-end gap-2', className)} {...props} />;
}
