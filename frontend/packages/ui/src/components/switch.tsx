import { Switch as SwitchPrimitive } from '@base-ui/react/switch';
import { cn } from '../lib/cn';

export type SwitchProps = SwitchPrimitive.Root.Props;

/** Notion-style toggle. */
export function Switch({ className, ...props }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'relative inline-flex h-[18px] w-[30px] shrink-0 items-center rounded-full bg-accent-strong p-[2px] transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring data-checked:bg-primary disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="size-[14px] rounded-full bg-white shadow-sm transition-transform duration-150 data-checked:translate-x-[12px]" />
    </SwitchPrimitive.Root>
  );
}
