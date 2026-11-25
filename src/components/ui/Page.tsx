import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import { EmptyState } from './EmptyState';

/**
 * Page head: the narrow heavy title, then one or two sentences in the lead size.
 * The figure that matters in the lead is ringed with <c> in the message (see Rich).
 */
export function PageHeader({ title, actions, children }: { title: string; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-10 grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <h1 className="title-page min-w-0 text-ink">{title}</h1>
        {actions ? <div className="flex flex-wrap items-center gap-3 pb-1">{actions}</div> : null}
      </div>
      {children ? <div className="max-w-measure text-lead text-ink [text-wrap:pretty]">{children}</div> : null}
    </header>
  );
}

/** A titled block inside a page. `band` lays it on the second ground, edge to edge of the content column. */
export function Section({
  title,
  description,
  actions,
  band = false,
  children,
  id,
}: {
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
  band?: boolean;
  children: ReactNode;
  id?: string;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section
      aria-labelledby={headingId}
      className={band ? '-mx-(--space-gutter) bg-ground-alt px-(--space-gutter) py-(--space-band)' : 'py-2'}
    >
      {title ? (
        <div className="mb-6 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
          <div className="min-w-0">
            <h2 id={headingId} className="title-section text-ink">
              {title}
            </h2>
            {description ? <p className="mt-3 max-w-measure text-body text-ink">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
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
      <p className="flex items-center gap-2 text-body text-muted" role="status">
        <Loader2 aria-hidden className="spin size-4" />
        {t('common.loading')}
      </p>
    );
  }
  if (query.isError) {
    return (
      <EmptyState
        role="alert"
        title={t('common.loadErrorTitle')}
        action={
          <Button variant="secondary" onClick={() => void query.refetch()}>
            {t('common.retry')}
          </Button>
        }
      >
        {t('common.loadError')}
      </EmptyState>
    );
  }
  return <>{children()}</>;
}
