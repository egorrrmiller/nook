import { Menu as MenuPrimitive } from '@base-ui/react/menu';
import { ContextMenu as ContextMenuPrimitive } from '@base-ui/react/context-menu';
import { CheckIcon, ChevronRightIcon } from 'lucide-react';
import { cn } from '../lib/cn';

const popupClass =
  'z-50 max-h-(--available-height) min-w-44 overflow-y-auto rounded-md bg-popover p-1 text-sm text-popover-foreground outline-none [box-shadow:var(--shadow-popover)]';

const itemClass =
  'relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4 [&_svg]:text-muted-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:[&_svg]:text-destructive';

/* ---------- Dropdown menu ---------- */

export function Menu(props: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root {...props} />;
}

export function MenuTrigger(props: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="menu-trigger" {...props} />;
}

export type MenuContentProps = MenuPrimitive.Popup.Props &
  Pick<MenuPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset'>;

export function MenuContent({
  className,
  align = 'start',
  alignOffset = 0,
  side = 'bottom',
  sideOffset = 4,
  ...props
}: MenuContentProps) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="z-50 outline-none"
      >
        <MenuPrimitive.Popup data-slot="menu-content" className={cn(popupClass, className)} {...props} />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

export interface MenuItemProps extends MenuPrimitive.Item.Props {
  variant?: 'default' | 'destructive';
  shortcut?: string;
}

export function MenuItem({ className, variant = 'default', shortcut, children, ...props }: MenuItemProps) {
  return (
    <MenuPrimitive.Item data-slot="menu-item" data-variant={variant} className={cn(itemClass, className)} {...props}>
      {children}
      {shortcut ? <span className="ml-auto pl-4 text-xs text-muted-foreground">{shortcut}</span> : null}
    </MenuPrimitive.Item>
  );
}

export function MenuCheckboxItem({ className, children, ...props }: MenuPrimitive.CheckboxItem.Props) {
  return (
    <MenuPrimitive.CheckboxItem className={cn(itemClass, 'pl-7', className)} {...props}>
      <MenuPrimitive.CheckboxItemIndicator className="absolute left-2 flex items-center">
        <CheckIcon className="size-3.5" />
      </MenuPrimitive.CheckboxItemIndicator>
      {children}
    </MenuPrimitive.CheckboxItem>
  );
}

export function MenuGroup(props: MenuPrimitive.Group.Props) {
  return <MenuPrimitive.Group {...props} />;
}

export function MenuLabel({ className, ...props }: MenuPrimitive.GroupLabel.Props) {
  return (
    <MenuPrimitive.GroupLabel
      className={cn('px-2 py-1 text-xs font-medium text-muted-foreground', className)}
      {...props}
    />
  );
}

export function MenuSeparator({ className, ...props }: MenuPrimitive.Separator.Props) {
  return <MenuPrimitive.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />;
}

export function MenuSub(props: MenuPrimitive.SubmenuRoot.Props) {
  return <MenuPrimitive.SubmenuRoot {...props} />;
}

export function MenuSubTrigger({ className, children, ...props }: MenuPrimitive.SubmenuTrigger.Props) {
  return (
    <MenuPrimitive.SubmenuTrigger className={cn(itemClass, 'data-popup-open:bg-accent', className)} {...props}>
      {children}
      <ChevronRightIcon className="ml-auto size-4" />
    </MenuPrimitive.SubmenuTrigger>
  );
}

export function MenuSubContent({ className, ...props }: MenuPrimitive.Popup.Props) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner className="z-50 outline-none" sideOffset={-4} alignOffset={-4}>
        <MenuPrimitive.Popup className={cn(popupClass, className)} {...props} />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

/* ---------- Context menu (right click) — shares item components ---------- */

export function ContextMenu(props: ContextMenuPrimitive.Root.Props) {
  return <ContextMenuPrimitive.Root {...props} />;
}

export function ContextMenuTrigger(props: ContextMenuPrimitive.Trigger.Props) {
  return <ContextMenuPrimitive.Trigger data-slot="context-menu-trigger" {...props} />;
}

export function ContextMenuContent({ className, ...props }: ContextMenuPrimitive.Popup.Props) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Positioner className="z-50 outline-none">
        <ContextMenuPrimitive.Popup className={cn(popupClass, className)} {...props} />
      </ContextMenuPrimitive.Positioner>
    </ContextMenuPrimitive.Portal>
  );
}
