import { cn } from '@nook/ui';
import { valueCellClass, type EditorProps } from './types';

export function CheckboxEditor({ prop, onChange, readOnly, name }: EditorProps) {
  const checked = prop.value === true;
  return (
    <label className={cn(valueCellClass, 'cursor-pointer gap-2', readOnly && 'cursor-default hover:bg-transparent')}>
      <input
        type="checkbox"
        aria-label={name}
        checked={checked}
        disabled={readOnly}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 cursor-pointer rounded-sm accent-[var(--primary)] disabled:cursor-default"
      />
      <span className="text-xs text-muted-foreground">{checked ? 'Yes' : 'No'}</span>
    </label>
  );
}
