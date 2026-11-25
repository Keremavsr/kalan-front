import type { ReactNode } from 'react';
import { cx } from '../../lib/cx';

/**
 * The list of the site ("Son yazılar"): an ink rule on top, hairlines between rows, a small meta
 * on the left, a readable title in the middle, a small tag or figure on the right.
 */
export function List({ children, label, className }: { children: ReactNode; label?: string; className?: string }) {
  return (
    <ul aria-label={label} className={cx('border-t border-ink', className)}>
      {children}
    </ul>
  );
}

export interface ListRowProps {
  meta?: ReactNode;
  title: ReactNode;
  detail?: ReactNode;
  aside?: ReactNode;
  /** A mark drawn before the title (a pencil margin mark for a critical row). */
  mark?: ReactNode;
  /** Narrow meta column for a number instead of a date. */
  narrowMeta?: boolean;
  className?: string;
  children?: ReactNode;
}

export function ListRow({ meta, title, detail, aside, mark, narrowMeta = false, className, children }: ListRowProps) {
  return (
    <li
      className={cx(
        'grid items-baseline gap-x-6 gap-y-1 border-b border-line py-5',
        narrowMeta ? 'grid-cols-[1.5rem_minmax(0,1fr)_auto]' : 'grid-cols-[8rem_minmax(0,1fr)_auto]',
        className,
      )}
    >
      <div className="text-meta text-ink">{meta}</div>
      <div className="min-w-0">
        <div className="flex items-start gap-2">
          {mark}
          <div className="min-w-0 text-lead leading-snug font-bold text-ink">{title}</div>
        </div>
        {detail ? <div className="mt-1 text-body text-ink">{detail}</div> : null}
        {children}
      </div>
      <div className="text-right text-meta text-ink">{aside}</div>
    </li>
  );
}
