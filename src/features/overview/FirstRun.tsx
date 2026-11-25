import { ArrowRight, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useProviders } from '../../api/queries';
import { Slices } from '../../components/brand/Logo';
import { Dot, RollLabel, buttonClass } from '../../components/ui';
import { PencilLink } from '../../components/pencil';

/**
 * First run, before any statement: one flow with two steps. Uploading is the step that matters;
 * picking an AI tool is optional and only adds categories and commentary.
 */
export function FirstRun() {
  const { t } = useTranslation();
  const providers = useProviders();
  const chosen = providers.data?.providers.find((p) => p.id === providers.data?.selected);

  return (
    <section aria-labelledby="first-title" className="max-w-3xl">
      <Slices filled={0} className="mb-6 h-6 w-auto text-ink" />
      <h2 id="first-title" className="title-section text-ink">
        {t('overview.first.title')}
      </h2>
      <ol aria-label={t('overview.first.label')} className="mt-6 border-t border-ink">
        <li className="grid grid-cols-[5rem_minmax(0,1fr)] gap-x-6 gap-y-1 border-b border-line py-6">
          <span className="text-meta text-ink">{t('overview.first.step', { n: 1 })}</span>
          <div className="min-w-0">
            <h3 className="text-lead font-bold text-ink">{t('overview.first.uploadTitle')}</h3>
            <p className="mt-1 max-w-measure text-body text-ink">{t('overview.first.uploadBody')}</p>
            <Link to="/statements" className={buttonClass('go', 'md', 'mt-5', true)}>
              <RollLabel>{t('overview.first.uploadAction')}</RollLabel>
              <Dot>
                <ArrowRight className="size-4" />
              </Dot>
            </Link>
          </div>
        </li>
        <li className="grid grid-cols-[5rem_minmax(0,1fr)] gap-x-6 gap-y-1 border-b border-line py-6">
          <span className="text-meta text-ink">{t('overview.first.step', { n: 2 })}</span>
          <div className="min-w-0">
            <h3 className="text-lead font-bold text-ink">{t('overview.first.aiTitle')}</h3>
            <p className="mt-1 max-w-measure text-body text-ink">{t('overview.first.aiBody')}</p>
            {chosen ? (
              <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-body text-ink">
                <Check aria-hidden className="size-4 shrink-0" />
                <span>{t('overview.first.aiChosen', { name: chosen.name })}</span>
                <PencilLink to="/settings" className="text-meta font-semibold">
                  {t('overview.first.aiChange')}
                </PencilLink>
              </p>
            ) : (
              <Link to="/settings" className={buttonClass('secondary', 'md', 'mt-5')}>
                <RollLabel>{t('overview.first.aiAction')}</RollLabel>
              </Link>
            )}
          </div>
        </li>
      </ol>
    </section>
  );
}
