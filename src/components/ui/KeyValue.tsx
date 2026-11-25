import type { ReactNode } from 'react';
import { cx } from '../../lib/cx';

export interface KeyValueItem {
  /** Short key: a letter or an abbreviation, set heavy (the museum label of the site). */
  k?: string;
  label: ReactNode;
  value: ReactNode;
}

/** Museum label: an ink rule on top, hairline rows of key, label and value. */
export function KeyValue({ items, className }: { items: KeyValueItem[]; className?: string }) {
  const keyed = items.some((i) => i.k);
  return (
    <dl className={cx('border-t-2 border-ink text-meta', className)}>
      {items.map((item, i) => (
        <div
          key={i}
          className={cx(
            'grid items-baseline gap-x-3 border-b border-line py-2.5',
            keyed ? 'grid-cols-[2.5rem_minmax(0,9rem)_minmax(0,1fr)]' : 'grid-cols-[minmax(0,11rem)_minmax(0,1fr)]',
          )}
        >
          <dt className="contents">
            {keyed ? <span className="font-extrabold">{item.k}</span> : null}
            <span className="text-ink">{item.label}</span>
          </dt>
          <dd className="font-semibold text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
