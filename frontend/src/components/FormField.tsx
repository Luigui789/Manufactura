import type { InputHTMLAttributes } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function FormField({
  label,
  error,
  helper,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  helper?: string;
  id: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        <Label htmlFor={id}>{label}</Label>
        {props.required && (
          <span aria-hidden="true" className="text-sm">
            *
          </span>
        )}
      </div>
      <Input
        {...props}
        id={id}
        aria-invalid={!!error}
        aria-describedby={
          [helper && `${id}-help`, error && `${id}-error`, props['aria-describedby']]
            .filter(Boolean)
            .join(' ') || undefined
        }
      />
      {helper && (
        <p id={`${id}-help`} className="text-sm text-muted-foreground">
          {helper}
        </p>
      )}
      {error && (
        <p role="alert" id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
