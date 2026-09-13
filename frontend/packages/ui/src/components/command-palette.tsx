import { Command as CommandPrimitive } from 'cmdk';
import { SearchIcon } from 'lucide-react';
import { cn } from '../lib/cn';
import { Dialog, DialogContent } from './dialog';

export function Command({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      className={cn('flex h-full w-full flex-col overflow-hidden rounded-lg bg-popover text-popover-foreground', className)}
      {...props}
    />
  );
}

export function CommandInput({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-3" cmdk-input-wrapper="">
      <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
      <CommandPrimitive.Input
        className={cn(
          'h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50',
          className,
        )}
        {...props}
      />
    </div>
  );
}

export function CommandList({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      className={cn('max-h-80 overflow-x-hidden overflow-y-auto p-1', className)}
      {...props}
    />
  );
}

export function CommandEmpty(props: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return <CommandPrimitive.Empty className="py-6 text-center text-sm text-muted-foreground" {...props} />;
}

export function CommandGroup({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      className={cn(
        'overflow-hidden [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function CommandSeparator({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return <CommandPrimitive.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />;
}

export function CommandItem({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      className={cn(
        'relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function CommandShortcut({ className, ...props }: React.ComponentProps<'span'>) {
  return <span className={cn('ml-auto text-xs tracking-widest text-muted-foreground', className)} {...props} />;
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  /** Passed to cmdk; e.g. to disable built-in filtering when you filter yourself. */
  shouldFilter?: boolean;
  label?: string;
}

/** ⌘K style palette: a Dialog hosting a cmdk `Command`. */
export function CommandPalette({ open, onOpenChange, children, shouldFilter, label = 'Command palette' }: CommandPaletteProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showClose={false} className="top-[18%] max-w-xl -translate-y-0 gap-0 overflow-hidden p-0" aria-label={label}>
        <Command label={label} shouldFilter={shouldFilter} loop>
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
}
