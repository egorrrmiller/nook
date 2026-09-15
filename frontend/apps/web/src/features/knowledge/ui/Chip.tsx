import type { ComponentProps } from 'react';
import { XIcon } from 'lucide-react';
import { IconButton, cn } from '@nook/ui';
import { chipStyle } from '../lib/tag-colors';

export interface ChipProps extends Omit<ComponentProps<'span'>, 'color'> {
  label: string;
  color?: string | null;
  size?: 'sm' | 'md';
  onRemove?: () => void;
  /** Dimmed style for derived (inline `#tag`) chips. */
  muted?: boolean;
}

/** Notion-style coloured pill used for tags and select options. */
export function Chip({ label, color, size = 'md', onRemove, muted, className, ...rest }: ChipProps) {
  return (
    <span
      data-slot="chip"
      className={cn(
        'inline-flex max-w-full items-center gap-0.5 rounded-sm font-medium leading-tight whitespace-nowrap',
        size === 'sm' ? 'h-[18px] px-1.5 text-[11px]' : 'h-5 px-1.5 text-xs',
        muted && 'opacity-70 [&>span]:italic',
        className,
      )}
      style={chipStyle(color, label)}
      {...rest}
    >
      <span className="truncate">{label}</span>
      {onRemove ? (
        <IconButton
          label={`Remove ${label}`}
          size="icon-sm"
          tooltip={false}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="-mr-0.5 size-4 rounded-sm p-0 opacity-60 hover:opacity-100 [&_svg]:size-3"
        >
          <XIcon />
        </IconButton>
      ) : null}
    </span>
  );
}
