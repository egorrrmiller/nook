import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-transparent text-sm font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:brightness-95 active:brightness-90',
        secondary: 'bg-muted text-foreground border-border hover:bg-accent',
        outline: 'border-input bg-background text-foreground hover:bg-accent',
        ghost: 'text-foreground hover:bg-accent aria-expanded:bg-accent',
        subtle: 'text-muted-foreground hover:bg-accent hover:text-foreground aria-expanded:bg-accent',
        destructive: 'bg-destructive text-destructive-foreground hover:brightness-95',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        xs: 'h-6 px-1.5 text-xs rounded-sm',
        sm: 'h-7 px-2 text-[13px]',
        md: 'h-8 px-3',
        lg: 'h-9 px-4',
        icon: 'size-7 p-0',
        'icon-sm': 'size-6 p-0 rounded-sm',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
);

export type ButtonProps = ButtonPrimitive.Props & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
