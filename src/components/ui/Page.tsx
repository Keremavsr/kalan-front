import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import { Notice } from './Notice';

export function PageHeader({ title, actions, children }: { title: string; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
        <h1 className="font-display text-3xl leading-tight font-semibold text-ink">{title}</h1>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children ? <div className="mt-4 max-w-3xl text-base leading-relaxed text-ink">{children}</div> : null}
    </header>
  );
}

interface QueryLike {
  isPending: boolean;
  isError: boolean;
  refetch: () => unknown;
}

/** Shared loading and error states so every screen behaves the same. */
export function QueryState({ query, children }: { query: QueryLike; children: () => ReactNode }) {
  const { t } = useTranslation();
  if (query.isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-ink-muted" role="status">
        <Loader2 aria-hidden className="spin size-4" />
        {t('common.loading')}
      </p>
    );
  }
  if (query.isError) {
    return (
      <Notice
        tone="negative"
        role="alert"
        title={t('common.loadError')}
        actions={
          <Button size="sm" onClick={() => void query.refetch()}>
            {t('common.retry')}
          </Button>
        }
      />
    );
  }
  return <>{children()}</>;
}
