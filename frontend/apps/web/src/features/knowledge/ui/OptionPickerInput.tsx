import type { KeyboardEvent, ReactNode, RefObject } from 'react';
import { Input } from '@nook/ui';

/** Shared chip + search input header used by tag and select pickers. */
export function OptionPickerInput({
  inputRef,
  value,
  onChange,
  onKeyDown,
  placeholder,
  ariaLabel,
  children,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  ariaLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-border bg-muted px-2 py-1.5">
      {children}
      <Input
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="h-6 min-w-24 flex-1 rounded-none border-0 bg-transparent px-0 py-0 text-sm shadow-none focus-visible:border-0 focus-visible:ring-0"
      />
    </div>
  );
}
