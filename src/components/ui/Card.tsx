import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../../lib/cx';

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Remove inner padding, for cards that hold a full-bleed table or list. */
  flush?: boolean;
  as?: 'section' | 'div' | 'article';
}

/** Paper card: flat, 14px corners, a title over an ink rule, then the content. */
export function Card({ title, description, actions, flush = false, as: Tag = 'section', className, children, ...rest }: CardProps) {
  const hasHeader = Boolean(title || actions);
  return (
    <Tag className={cx('min-w-0 rounded-card bg-paper', className)} {...rest}>
      {hasHeader ? (
        <header className="mx-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-ink pt-5 pb-3">
          <div className="min-w-0">
            {title ? <h2 className="text-title font-bold text-ink">{title}</h2> : null}
            {description ? <p className="mt-1 text-meta text-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={flush ? 'pb-2' : 'px-6 py-5'}>{children}</div>
    </Tag>
  );
}
