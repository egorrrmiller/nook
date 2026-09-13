import { Input as InputPrimitive } from '@base-ui/react/input';
import { useId } from 'react';
import { cn } from '../lib/cn';

export type InputProps = React.ComponentProps<'input'>;

export function Input({ className, type = 'text', ...props }: InputProps) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        'h-8 w-full min-w-0 rounded-md border border-input bg-background px-2.5 py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/30',
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.ComponentProps<'label'>) {
  return <label className={cn('text-xs font-medium text-muted-foreground', className)} {...props} />;
}

export interface FieldProps extends InputProps {
  label: string;
  error?: string | null;
  hint?: string;
}

/** Label + input + error message. */
export function Field({ label, error, hint, id, className, ...input }: FieldProps) {
  const auto = useId();
  const inputId = id ?? auto;
  const errId = `${inputId}-error`;
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <Label htmlFor={inputId}>{label}</Label>
      <Input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errId : undefined}
        {...input}
      />
      {error ? (
        <p id={errId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
