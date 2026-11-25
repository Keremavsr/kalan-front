import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAnalysisRun, useProviders, useStartAnalysisAll } from '../../api/queries';
import { Button, buttonClass, useToast } from '../../components/ui';
import { useErrorText } from '../../components/ui/errorText';

/**
 * "Kategorisiz N işlem": shows those rows (each one's category opens the usual rule sheet), and with an AI tool
 * chosen, hands them to the tool in one go.
 */
export function UncategorizedBar({ count, active, onShow }: { count: number; active: boolean; onShow: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const errorText = useErrorText();
  const providers = useProviders();
  const run = useAnalysisRun();
  const start = useStartAnalysisAll();
  const hasProvider = Boolean(providers.data?.selected);
  const running = run.data?.status === 'pending' || start.isPending;

  function sort() {
    start.mutate(undefined, {
      onSuccess: () => toast.show(t('spending.uncategorized.started'), 'positive'),
      onError: (error) => toast.show(errorText(error, t('spending.uncategorized.failed')), 'neutral'),
    });
  }

  return (
    <div className="mx-6 mt-5 flex flex-wrap items-center gap-x-5 gap-y-3 border-y border-line py-3">
      <p className="text-body text-ink">
        <span className="font-semibold">{t('spending.uncategorized.count', { count })}</span>{' '}
        {hasProvider ? t('spending.uncategorized.hintAi') : t('spending.uncategorized.hint')}
      </p>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={onShow} aria-pressed={active}>
          {active ? t('spending.uncategorized.showAll') : t('spending.uncategorized.show')}
        </Button>
        {hasProvider ? (
          <Button variant="primary" size="sm" onClick={sort} loading={running} disabled={running}>
            {running ? t('spending.uncategorized.running') : t('spending.uncategorized.ai')}
          </Button>
        ) : providers.isSuccess ? (
          <Link to="/settings" className={buttonClass('ghost', 'sm')}>
            {t('spending.uncategorized.connect')}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
