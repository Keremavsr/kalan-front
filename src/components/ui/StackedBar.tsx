import type { ReactNode } from 'react';
import { SERIES_CLASS, type Series } from '../../lib/series';
import { cx } from '../../lib/cx';

export interface BarPart {
  key: string;
  value: number;
  series: Series;
  /** Label drawn inside the slice when it is wide enough (a share or an amount). */
  label?: string;
}

export interface StackedBarProps {
  parts: BarPart[];
  /** Accessible summary of the whole bar, e.g. the parts as a sentence. */
  label: string;
  /** Small muted line under the bar. */
  caption?: ReactNode;
  heading?: ReactNode;
  aside?: ReactNode;
  size?: 'md' | 'sm';
  /** Slices narrower than this share hide their label (the caption still has it). */
  labelMin?: number;
}

/**
 * Horizontal stacked bar from the site: straight edges, label inside each slice, a thin ground gap
 * between slices, a muted caption under it. It grows once from the left on first paint.
 */
export function StackedBar({ parts, label, caption, heading, aside, size = 'md', labelMin = 0.07 }: StackedBarProps) {
  const total = parts.reduce((sum, p) => sum + p.value, 0) || 1;
  return (
    <figure className="grid min-w-0 gap-2">
      {heading || aside ? (
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          {heading ? <div className="text-lead font-bold text-ink">{heading}</div> : <span />}
          {aside ? <div className="text-meta text-ink">{aside}</div> : null}
        </div>
      ) : null}
      <div
        role="img"
        aria-label={label}
        className={cx('bar-x flex overflow-hidden rounded-bar bg-ground-alt', size === 'md' ? 'h-12' : 'h-8')}
      >
        {parts.map((p, i) => {
          const share = p.value / total;
          const c = SERIES_CLASS[p.series];
          return (
            <div
              key={p.key}
              className={cx(
                'flex min-w-0 items-center overflow-hidden px-2 text-meta font-bold whitespace-nowrap',
                c.fill,
                c.text,
                i > 0 && 'border-l-2 border-paper',
              )}
              style={{ flexGrow: p.value, flexBasis: 0 }}
            >
              {p.label && share >= labelMin ? <span aria-hidden>{p.label}</span> : null}
            </div>
          );
        })}
      </div>
      {caption ? <figcaption className="text-meta text-muted">{caption}</figcaption> : null}
    </figure>
  );
}

/** A small square of a series colour, for legends and table rows. */
export function Swatch({ series, className }: { series: Series; className?: string }) {
  return <span aria-hidden className={cx('inline-block size-3 shrink-0 rounded-swatch', SERIES_CLASS[series].fill, className)} />;
}
