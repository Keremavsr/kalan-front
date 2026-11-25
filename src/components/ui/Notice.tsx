import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { cx } from '../../lib/cx';

export type NoticeTone = 'info' | 'positive' | 'caution' | 'negative';

const tones: Record<NoticeTone, { border: string; icon: string; Icon: typeof Info }> = {
  info: { border: 'border-l-line-strong', icon: 'text-ink-muted', Icon: Info },
  positive: { border: 'border-l-positive', icon: 'text-positive', Icon: CheckCircle2 },
  caution: { border: 'border-l-caution', icon: 'text-caution', Icon: AlertTriangle },
  negative: { border: 'border-l-negative', icon: 'text-negative', Icon: XCircle },
};

export interface NoticeProps {
  tone?: NoticeTone;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
  role?: 'status' | 'alert';
}

/** A status message. Colour lives in the left rule and the icon; surface and text stay neutral. */
export function Notice({ tone = 'info', title, children, actions, className, role }: NoticeProps) {
  const { border, icon, Icon } = tones[tone];
  return (
    <div role={role} className={cx('flex gap-3 rounded-md border border-line border-l-3 bg-surface px-4 py-3', border, className)}>
      <Icon aria-hidden className={cx('mt-0.5 size-4 shrink-0', icon)} />
      <div className="min-w-0 flex-1 text-sm text-ink">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={title ? 'mt-1' : ''}>{children}</div> : null}
        {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
