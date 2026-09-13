import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { cn } from '../lib/cn';

export function Popover(props: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root {...props} />;
}

export function PopoverTrigger(props: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

export type PopoverContentProps = PopoverPrimitive.Popup.Props &
  Pick<PopoverPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset'>;

export function PopoverContent({
  className,
  align = 'start',
  alignOffset = 0,
  side = 'bottom',
  sideOffset = 4,
  ...props
}: PopoverContentProps) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="z-50"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            'z-50 min-w-48 rounded-md bg-popover p-1 text-sm text-popover-foreground outline-none [box-shadow:var(--shadow-popover)]',
            className,
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

export const PopoverClose = PopoverPrimitive.Close;
