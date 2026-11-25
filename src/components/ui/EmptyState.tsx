import type { ReactNode } from 'react';
import { Slices } from '../brand/Logo';

export interface EmptyStateProps {
  title: string;
  children?: ReactNode;
  /** At most one action. */
  action?: ReactNode;
  /** 'empty': the slice pill with every slice open (nothing here yet). 'full': all slices filled (done). */
  mark?: 'empty' | 'full' | 'none';
  role?: 'status' | 'alert';
}

/** Empty and error states: a short title, one sentence, one action if there is a next step. No illustration. */
export function EmptyState({ title, children, action, mark = 'none', role }: EmptyStateProps) {
  return (
    <div role={role} className="max-w-measure py-6">
      {mark !== 'none' ? <Slices filled={mark === 'full' ? 4 : 0} className="mb-6 h-6 w-auto text-ink" /> : null}
      <h2 className="title-section text-ink">{title}</h2>
      {children ? <p className="mt-3 text-lead text-ink">{children}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
