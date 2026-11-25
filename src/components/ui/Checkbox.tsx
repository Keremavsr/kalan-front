import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../lib/cx';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'id'> {
  label: ReactNode;
  hint?: ReactNode;
}

/** A plain ink checkbox with its label on the right and an optional muted line under it. */
export function Checkbox({ label, hint, className, disabled, ...rest }: CheckboxProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className={cx('grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-3 gap-y-1', className)}>
      <input
        id={id}
        type="checkbox"
        disabled={disabled}
        aria-describedby={hintId}
        className="mt-1 size-4 cursor-pointer accent-ink disabled:cursor-not-allowed"
        {...rest}
      />
      <label htmlFor={id} className={cx('text-body text-ink', disabled ? 'cursor-not-allowed opacity-55' : 'cursor-pointer')}>
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="col-start-2 text-meta text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
