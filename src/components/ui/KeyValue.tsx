import type { ReactNode } from 'react';
import { cx } from '../../lib/cx';

export interface KeyValueItem {
  /** Short key: a letter or an abbreviation, set heavy (the museum label of the site). */
  k?: string;
  label: ReactNode;
  value: ReactNode;
}

/**
 * Museum label: an ink rule on top, hairline rows of key, label and value.
 * The rows share one grid (subgrid), so the label column is only as wide as the longest label (up to 9rem)
 * and the value keeps the rest of a narrow column instead of breaking into many lines.
 */
export function KeyValue({ items, className }: { items: KeyValueItem[]; className?: string }) {
  const keyed = items.some((i) => i.k);
  return (
    <dl
      className={cx(
        'grid gap-x-3 border-t-2 border-ink text-meta',
        keyed ? 'grid-cols-[2rem_fit-content(9rem)_minmax(0,1fr)]' : 'grid-cols-[fit-content(11rem)_minmax(0,1fr)]',
        className,
      )}
    >
      {items.map((item, i) => (
        <div key={i} className="col-span-full grid grid-cols-subgrid items-baseline border-b border-line py-2.5">
          <dt className="contents">
            {keyed ? <span className="font-extrabold">{item.k}</span> : null}
            <span className="text-ink">{item.label}</span>
          </dt>
          <dd className="font-semibold text-ink [text-wrap:pretty]">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
