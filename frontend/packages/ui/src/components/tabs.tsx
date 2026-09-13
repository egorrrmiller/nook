import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';
import { cn } from '../lib/cn';

export function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return <TabsPrimitive.Root className={cn('flex flex-col gap-2', className)} {...props} />;
}

/** Underlined tab strip (Notion picker style). */
export function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      className={cn('relative flex items-center gap-1 border-b border-border px-1', className)}
      {...props}
    >
      {props.children}
      <TabsPrimitive.Indicator className="absolute bottom-[-1px] left-[var(--active-tab-left)] h-0.5 w-[var(--active-tab-width)] bg-foreground transition-[left,width] duration-150" />
    </TabsPrimitive.List>
  );
}

export function TabsTab({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      className={cn(
        'h-8 rounded-sm px-2 text-sm text-muted-foreground outline-none select-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-active:text-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function TabsPanel({ className, ...props }: TabsPrimitive.Panel.Props) {
  return <TabsPrimitive.Panel className={cn('outline-none', className)} {...props} />;
}
