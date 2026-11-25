import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { cx } from '../../lib/cx';

interface FieldFrameProps {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  className?: string | undefined;
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

export function FieldFrame({ label, hint, error, className, children }: FieldFrameProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint ? (
        <p id={hintId} className="text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs font-medium text-negative">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const controlClass = cx(
  'h-10 w-full rounded-md border bg-surface px-3 text-sm text-ink',
  'border-control hover:border-ink-muted',
  'transition-[border-color] duration-(--duration-fast) ease-(--ease-standard)',
  'aria-[invalid=true]:border-negative',
  'placeholder:text-ink-muted',
);

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  fieldClassName?: string;
}

export function TextField({ label, hint, error, fieldClassName, className, ...rest }: TextFieldProps) {
  return (
    <FieldFrame label={label} hint={hint} error={error} className={fieldClassName}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={cx(controlClass, className)}
          {...rest}
        />
      )}
    </FieldFrame>
  );
}

export interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  options: Array<{ value: string; label: string }>;
  fieldClassName?: string;
}

export function SelectField({ label, hint, error, options, fieldClassName, className, ...rest }: SelectFieldProps) {
  return (
    <FieldFrame label={label} hint={hint} error={error} className={fieldClassName}>
      {({ id, describedBy, invalid }) => (
        <select
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={cx(controlClass, 'pr-8', className)}
          {...rest}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </FieldFrame>
  );
}
