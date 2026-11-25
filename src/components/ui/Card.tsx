import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../../lib/cx';

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Remove inner padding, for cards that hold a full-bleed table. */
  flush?: boolean;
  as?: 'section' | 'div' | 'article';
}

export function Card({ title, description, actions, flush = false, as: Tag = 'section', className, children, ...rest }: CardProps) {
  const hasHeader = Boolean(title || actions);
  return (
    <Tag className={cx('rounded-lg border border-line bg-surface shadow-raised', className)} {...rest}>
      {hasHeader ? (
        <header className={cx('flex items-start justify-between gap-4 px-5 pt-4', flush ? 'pb-3' : 'pb-0')}>
          <div className="min-w-0">
            {title ? <h2 className="font-display text-lg leading-tight text-ink">{title}</h2> : null}
            {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={flush ? '' : 'px-5 py-4'}>{children}</div>
    </Tag>
  );
}
