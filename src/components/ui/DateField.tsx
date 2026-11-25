import { useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { cx } from '../../lib/cx';
import { controlClass } from './Field';

/**
 * A date (YYYY-MM-DD) or a month (YYYY-MM) picked with pill selects in the app language.
 * The native date input follows the operating system locale, not the language chosen in kalan, so the
 * day, month name and year are separate selects whose names come from Intl in `locale`.
 * `optional` (month mode) adds an empty month choice; the value is then ''.
 */
export interface DateFieldProps {
  label: string;
  /** Intl locale of the interface ("tr-TR"). */
  locale: string;
  mode?: 'date' | 'month';
  value: string;
  onChange: (value: string) => void;
  /** First and last selectable year. */
  years: [number, number];
  optional?: boolean;
  /** Label of the empty choice when `optional`. */
  emptyLabel?: string;
  /** Year shown while the value is empty. */
  defaultYear?: number;
  hint?: string | undefined;
  error?: string | undefined;
  className?: string;
  /** Accessible names of the parts, in the interface language. */
  parts: { day?: string; month: string; year: string };
}

function daysIn(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const pad = (n: number) => String(n).padStart(2, '0');

export function DateField({
  label,
  locale,
  mode = 'date',
  value,
  onChange,
  years,
  optional = false,
  emptyLabel = '',
  defaultYear,
  hint,
  error,
  className,
  parts,
}: DateFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  const [y, m, d] = value ? value.split('-').map(Number) : [defaultYear ?? years[0], 0, 0];
  const year = y ?? defaultYear ?? years[0];
  const month = m ?? 0;
  const day = d ?? 1;

  const monthNames = Array.from({ length: 12 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, i, 1))),
  );
  const yearList = Array.from({ length: years[1] - years[0] + 1 }, (_, i) => years[0] + i);
  if (value && !yearList.includes(year)) yearList.push(year);
  yearList.sort((a, b) => a - b);

  function emit(nextYear: number, nextMonth: number, nextDay: number) {
    if (!nextMonth) {
      onChange('');
      return;
    }
    if (mode === 'month') {
      onChange(`${nextYear}-${pad(nextMonth)}`);
      return;
    }
    const clipped = Math.min(nextDay || 1, daysIn(nextYear, nextMonth));
    onChange(`${nextYear}-${pad(nextMonth)}-${pad(clipped)}`);
  }

  const invalid = Boolean(error) || undefined;
  const select = (extra?: string) => cx(controlClass, 'cursor-pointer appearance-none pr-9', extra);
  const chevron = <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-ink" />;
  const empty = !month;

  // Order the parts the way the language writes a date: "25 Kasım 2026" vs "November 25, 2026".
  const order = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .formatToParts(new Date(Date.UTC(2026, 10, 25)))
    .map((p) => p.type)
    .filter((t): t is 'day' | 'month' | 'year' => t === 'day' || t === 'month' || t === 'year');

  const pieces = {
    day:
      mode === 'date' ? (
        <span key="day" className="relative block w-22 shrink-0">
          <select
            aria-label={parts.day}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            className={select('tabular-nums')}
            value={empty ? '' : String(day)}
            disabled={empty}
            onChange={(e) => emit(year, month, Number(e.target.value))}
          >
            {empty ? <option value="" /> : null}
            {Array.from({ length: daysIn(year, month || 1) }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          {chevron}
        </span>
      ) : null,
    month: (
      <span key="month" className="relative block min-w-0 flex-1">
        <select
          aria-label={parts.month}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          className={select()}
          value={String(month || '')}
          onChange={(e) => emit(year, Number(e.target.value), day)}
        >
          {optional ? <option value="">{emptyLabel}</option> : null}
          {monthNames.map((name, i) => (
            <option key={name} value={i + 1}>
              {name}
            </option>
          ))}
        </select>
        {chevron}
      </span>
    ),
    year: (
      <span key="year" className="relative block w-28 shrink-0">
        <select
          aria-label={parts.year}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          className={select('tabular-nums')}
          value={String(year)}
          disabled={empty}
          onChange={(e) => emit(Number(e.target.value), month, day)}
        >
          {yearList.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        {chevron}
      </span>
    ),
  };

  return (
    <fieldset className={cx('min-w-0', className)} aria-describedby={describedBy}>
      <legend className="mb-1.5 text-meta font-semibold text-ink">{label}</legend>
      <div className="flex min-w-0 gap-2">{order.map((part) => pieces[part])}</div>
      {hint ? (
        <p id={hintId} className="mt-1.5 px-4 text-meta text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="mt-1.5 px-4 text-meta font-semibold text-ink">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
