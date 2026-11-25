import { useId } from 'react';
import { cx } from '../../lib/cx';

export interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  className?: string;
}

/** A small radio group drawn as a pill with an ink thumb. Arrow keys move between options natively. */
export function Segmented<T extends string>({ label, value, options, onChange, className }: SegmentedProps<T>) {
  const name = useId();
  return (
    <fieldset className={cx('inline-flex', className)}>
      <legend className="sr-only">{label}</legend>
      <div className="inline-flex rounded-pill border border-ink bg-paper p-1">
        {options.map((option) => (
          <label key={option.value} className="relative">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <span
              className={cx(
                'pressable flex h-8 cursor-pointer items-center rounded-pill px-4 text-meta font-semibold text-ink',
                'hover:bg-ground-alt peer-checked:bg-ink peer-checked:text-paper',
                'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink',
              )}
            >
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
