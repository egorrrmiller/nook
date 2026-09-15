import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

export type RadioProps = Omit<ComponentProps<'input'>, 'type'>;

/** Native radio with the shared Nook focus and accent treatment. */
export function Radio({ className, ...props }: RadioProps) {
  return <input {...props} type="radio" data-slot="radio" className={cn('size-4 accent-[var(--primary)]', className)} />;
}
