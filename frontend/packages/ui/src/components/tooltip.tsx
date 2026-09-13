import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';
import type { ReactElement, ReactNode } from 'react';
import { cn } from '../lib/cn';

export function TooltipProvider({ delay = 400, ...props }: TooltipPrimitive.Provider.Props) {
  return <TooltipPrimitive.Provider delay={delay} {...props} />;
}

export interface TooltipProps extends Omit<TooltipPrimitive.Root.Props, 'children'> {
  content: ReactNode;
  side?: TooltipPrimitive.Positioner.Props['side'];
  align?: TooltipPrimitive.Positioner.Props['align'];
  sideOffset?: number;
  /** The trigger element; receives the tooltip's aria wiring. */
  children: ReactElement;
  className?: string;
}

/** Simple tooltip: `<Tooltip content="Rename"><Button/></Tooltip>`. */
export function Tooltip({
  content,
  side = 'bottom',
  align = 'center',
  sideOffset = 6,
  children,
  className,
  ...root
}: TooltipProps) {
  return (
    <TooltipPrimitive.Root {...root}>
      <TooltipPrimitive.Trigger render={children} />
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Positioner side={side} align={align} sideOffset={sideOffset} className="z-50">
          <TooltipPrimitive.Popup
            className={cn(
              'z-50 rounded-sm bg-foreground px-2 py-1 text-xs font-medium text-background shadow-md',
              className,
            )}
          >
            {content}
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
