import { Avatar as AvatarPrimitive } from '@base-ui/react/avatar';
import { cn } from '../lib/cn';

export interface AvatarProps extends AvatarPrimitive.Root.Props {
  name: string;
  src?: string | null;
  size?: 'sm' | 'md' | 'lg';
  /** Ring/background colour, e.g. a collaborator colour. */
  color?: string;
}

const sizes = { sm: 'size-5 text-[10px]', md: 'size-6 text-xs', lg: 'size-8 text-sm' } as const;

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '?';
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + second).toUpperCase();
}

export function Avatar({ name, src, size = 'md', color, className, ...props }: AvatarProps) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-strong font-medium text-foreground select-none',
        sizes[size],
        className,
      )}
      style={color ? { backgroundColor: color, color: '#fff' } : undefined}
      title={name}
      {...props}
    >
      {src ? <AvatarPrimitive.Image src={src} alt={name} className="size-full object-cover" /> : null}
      <AvatarPrimitive.Fallback>{initials(name)}</AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
