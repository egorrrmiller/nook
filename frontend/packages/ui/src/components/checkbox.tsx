import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

export type CheckboxProps = Omit<ComponentProps<'input'>, 'type'>;

/** Native checkbox with the shared Nook focus and accent treatment. */
export function Checkbox({ className, ...props }: CheckboxProps) {
  return <input {...props} type="checkbox" data-slot="checkbox" className={cn('size-4 accent-[var(--primary)]', className)} />;
}
