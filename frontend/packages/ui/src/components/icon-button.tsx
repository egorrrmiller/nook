import { Button, type ButtonProps } from './button';
import { Tooltip } from './tooltip';

export interface IconButtonProps extends Omit<ButtonProps, 'size' | 'children'> {
  /** Accessible name; also shown as the tooltip. */
  label: string;
  size?: 'icon' | 'icon-sm';
  tooltip?: boolean;
  children: React.ReactNode;
}

export function IconButton({
  label,
  size = 'icon',
  variant = 'subtle',
  tooltip = true,
  children,
  ...props
}: IconButtonProps) {
  const btn = (
    <Button aria-label={label} size={size} variant={variant} {...props}>
      {children}
    </Button>
  );
  if (!tooltip) return btn;
  return <Tooltip content={label}>{btn}</Tooltip>;
}
