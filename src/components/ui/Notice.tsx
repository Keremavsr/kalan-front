import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MarginMark, Scribble } from '../pencil';
import { cx } from '../../lib/cx';

/**
 * How much a message matters is marked with the pencil, not with a coloured badge:
 * critical: a pencil mark in the margin and the word itself; warning: the title is underlined
 * by the pencil; info: no mark; done: a small ink tick. Text is always ink.
 */
export type NoticeTone = 'info' | 'done' | 'warning' | 'critical';

export interface NoticeProps {
  tone?: NoticeTone;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
  role?: 'status' | 'alert';
}

export function Notice({ tone = 'info', title, children, actions, className, role }: NoticeProps) {
  const { t } = useTranslation();
  return (
    <div role={role} className={cx('flex gap-3 rounded-card bg-paper px-5 py-4 text-ink', className)} data-tone={tone}>
      {tone === 'critical' ? <MarginMark className="mt-0.5" /> : null}
      {tone === 'done' ? <Check aria-hidden className="mt-1 size-4 shrink-0" /> : null}
      <div className="min-w-0 flex-1 text-body">
        {title || tone === 'critical' ? (
          <p className="font-semibold">
            {tone === 'critical' ? <span className="mr-2 font-bold">{t('common.critical')}</span> : null}
            {tone === 'warning' && typeof title === 'string' ? (
              <span className="scribble-host relative" data-marked="true">
                {title}
                <Scribble seed={title} />
              </span>
            ) : (
              title
            )}
          </p>
        ) : null}
        {children ? <div className={title || tone === 'critical' ? 'mt-1.5' : ''}>{children}</div> : null}
        {actions ? <div className="mt-4 flex flex-wrap items-center gap-3">{actions}</div> : null}
      </div>
    </div>
  );
}
