import { cn } from '../lib/cn';

export function Separator({ className, ...props }: React.ComponentProps<'hr'>) {
  return <hr className={cn('my-2 h-px w-full border-0 bg-border', className)} {...props} />;
}
