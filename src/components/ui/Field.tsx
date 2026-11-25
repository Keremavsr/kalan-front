import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cx } from '../../lib/cx';

interface FieldFrameProps {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  className?: string | undefined;
  /** Keep the label for screen readers only, when the layout already says what the field is. */
  labelHidden?: boolean | undefined;
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

/** Small label on top, the pill field, then the hint, or the error in bold ink (never in red). */
export function FieldFrame({ label, hint, error, className, labelHidden = false, children }: FieldFrameProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cx('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={id} className={labelHidden ? 'sr-only' : 'text-meta font-semibold text-ink'}>
        {label}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint ? (
        <p id={hintId} className="px-4 text-meta text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="px-4 text-meta font-semibold text-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** The e-mail field of the site: a paper pill with an ink edge. An invalid field gets a double edge. */
export const controlClass = cx(
  'h-11 w-full min-w-0 rounded-pill border border-ink bg-paper px-4 text-body text-ink',
  'transition-[box-shadow] duration-(--duration-1) ease-(--ease-out)',
  'aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-ink aria-[invalid=true]:ring-inset',
  'placeholder:text-muted placeholder:opacity-100 disabled:opacity-55',
);

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  fieldClassName?: string;
  labelHidden?: boolean;
}

export function TextField({ label, hint, error, fieldClassName, labelHidden, className, ...rest }: TextFieldProps) {
  return (
    <FieldFrame label={label} hint={hint} error={error} className={fieldClassName} labelHidden={labelHidden}>
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
  labelHidden?: boolean;
}

export function SelectField({ label, hint, error, options, fieldClassName, labelHidden, className, ...rest }: SelectFieldProps) {
  return (
    <FieldFrame label={label} hint={hint} error={error} className={fieldClassName} labelHidden={labelHidden}>
      {({ id, describedBy, invalid }) => (
        <span className="relative block">
          <select
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            className={cx(controlClass, 'cursor-pointer appearance-none pr-10', className)}
            {...rest}
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-ink" />
        </span>
      )}
    </FieldFrame>
  );
}
