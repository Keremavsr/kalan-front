import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import { Notice } from './Notice';
import { useErrorText } from './errorText';

interface QueryLike {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
}

/**
 * Loading and error states for one block inside a page, smaller than the page-level QueryState:
 * a quiet loading line, or a notice that says what failed with a retry.
 */
export function SectionState({
  query,
  failed,
  byCode,
  children,
}: {
  query: QueryLike;
  /** What could not be loaded, as a sentence ("Kategori kurallarını getiremedim."). */
  failed: string;
  byCode?: Record<string, string>;
  children: () => ReactNode;
}) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  if (query.isPending) {
    return (
      <p className="flex items-center gap-2 py-2 text-body text-muted" role="status">
        <Loader2 aria-hidden className="spin size-4" />
        {t('common.loading')}
      </p>
    );
  }
  if (query.isError) {
    const detail = errorText(query.error, '', byCode);
    return (
      <Notice
        tone="warning"
        role="alert"
        title={failed}
        actions={
          <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
            {t('common.retry')}
          </Button>
        }
      >
        {detail || null}
      </Notice>
    );
  }
  return <>{children()}</>;
}
