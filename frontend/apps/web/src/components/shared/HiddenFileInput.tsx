import type { ComponentProps, RefObject } from 'react';
import { cn } from '@nook/ui';

export interface HiddenFileInputProps extends Omit<ComponentProps<'input'>, 'type' | 'onChange'> {
  inputRef?: RefObject<HTMLInputElement | null>;
  onFile?: (file: File) => void;
  onFiles?: (files: File[]) => void;
}

/** Shared hidden file chooser. Resetting the value allows selecting the same file again. */
export function HiddenFileInput({
  inputRef,
  onFile,
  onFiles,
  className,
  ...props
}: HiddenFileInputProps) {
  return (
    <input
      {...props}
      ref={inputRef}
      type="file"
      className={cn('sr-only', className)}
      onChange={(event) => {
        const files = Array.from(event.currentTarget.files ?? []);
        if (files.length) {
          onFiles?.(files);
          if (onFile) onFile(files[0]!);
        }
        event.currentTarget.value = '';
      }}
    />
  );
}
