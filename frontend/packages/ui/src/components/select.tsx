import { ChevronDownIcon } from 'lucide-react';
import { cn } from '../lib/cn';

export interface SelectOption<V extends string> {
  value: V;
  label: string;
}

export interface SelectProps<V extends string>
  extends Omit<React.ComponentProps<'select'>, 'value' | 'onChange'> {
  value: V;
  onValueChange: (v: V) => void;
  options: readonly SelectOption<V>[];
}

/** Native select styled like an input — keyboard-native and robust inside menus/dialogs. */
export function Select<V extends string>({ value, onValueChange, options, className, ...props }: SelectProps<V>) {
  return (
    <span className={cn('relative inline-flex', className)}>
      <select
        value={value}
        onChange={(e) => onValueChange(e.target.value as V)}
        className="h-8 w-full appearance-none rounded-md border border-input bg-background pr-7 pl-2.5 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        {...props}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-muted-foreground" />
    </span>
  );
}
