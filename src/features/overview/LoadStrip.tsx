import { useTranslation } from 'react-i18next';
import { useSchedule } from '../../api/queries';
import type { Schedule } from '../../api/types';
import { PencilLink } from '../../components/pencil';
import { Button, Notice, Rich, useMoneyFormatter } from '../../components/ui';
import { formatMonth, formatMonthName } from '../../lib/format';
import { useIntlLocale } from '../../lib/useLocale';
import { readSchedule } from '../installments/schedule';

/** The next 12 months of installments as one thin strip; the full chart lives on Taksitler. */
export function LoadStrip() {
  const { t } = useTranslation();
  const schedule = useSchedule(12);
  if (schedule.isPending) return <p className="text-body text-muted" role="status">{t('common.loading')}</p>;
  if (schedule.isError)
    return (
      <Notice
        tone="warning"
        title={t('overview.load.loadError')}
        actions={
          <Button variant="secondary" size="sm" onClick={() => void schedule.refetch()}>
            {t('common.retry')}
          </Button>
        }
      >
        {t('common.loadError')}
      </Notice>
    );
  return <Strip schedule={schedule.data} />;
}

function Strip({ schedule }: { schedule: Schedule }) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const fmt = useMoneyFormatter();
  const reading = readSchedule(schedule);
  const max = Math.max(1, ...schedule.months.map((m) => m.total));
  const busy = schedule.months.filter((m) => m.total > 0).length;
  const sentence = reading.peak ? (
    <Rich
      i18nKey="overview.load.sentence"
      values={{ busy, month: formatMonth(reading.peak.month, locale), amount: fmt(reading.peak.total, schedule.currency) }}
    />
  ) : (
    t('overview.load.sentenceNone')
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <p className="max-w-measure text-body text-ink">{sentence}</p>
        <PencilLink to="/installments" className="text-meta font-semibold">
          {t('overview.load.go')}
        </PencilLink>
      </div>
      <figure aria-hidden className="grid gap-1.5">
        <div className="flex h-10 items-end gap-1 border-b border-ink">
          {schedule.months.map((m) => (
            <div key={m.month} className="flex h-full min-w-0 flex-1 items-end" title={`${formatMonth(m.month, locale)}: ${fmt(m.total, schedule.currency)}`}>
              <div
                className={m.total ? 'bar-y w-full rounded-t-bar bg-series-ink' : 'w-full'}
                style={{ height: `${(m.total / max) * 100}%` }}
              />
            </div>
          ))}
        </div>
        <div className="flex gap-1">
          {schedule.months.map((m) => (
            <span key={m.month} className="min-w-0 flex-1 truncate text-center text-meta text-muted">
              {formatMonthName(m.month, locale)}
            </span>
          ))}
        </div>
      </figure>
    </div>
  );
}
