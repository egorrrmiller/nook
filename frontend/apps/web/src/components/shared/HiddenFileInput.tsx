import type { ComponentProps, RefObject } from 'react';
import { cn } from '@nook/ui';

export interface HiddenFileInputProps extends Omit<ComponentProps<'input'>, 'type' | 'onChange'> {
  inputRef?: RefObject<HTMLInputElement | null>;
  onFile: (file: File) => void;
}

/** Shared hidden file chooser. Resetting the value allows selecting the same file again. */
export function HiddenFileInput({ inputRef, onFile, className, ...props }: HiddenFileInputProps) {
  return (
    <input
      {...props}
      ref={inputRef}
      type="file"
      className={cn('sr-only', className)}
      onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        if (file) onFile(file);
        event.currentTarget.value = '';
      }}
    />
  );
}
