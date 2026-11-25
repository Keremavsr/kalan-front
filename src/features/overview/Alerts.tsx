import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAlerts } from '../../api/queries';
import type { Alert, AlertKind } from '../../api/types';
import { MarginMark, PencilLink, Scribble } from '../../components/pencil';
import { Button, List, ListRow, Notice, Rich, useMoneyFormatter } from '../../components/ui';
import { TextButton } from '../../components/ui/TextButton';
import { bankName } from '../../lib/banks';
import { formatDate, formatMonth } from '../../lib/format';
import { useIntlLocale } from '../../lib/useLocale';

const KNOWN: AlertKind[] = [
  'installment_ending',
  'limit_high',
  'interest_charged',
  'fee_charged',
  'tax_charged',
  'foreign_currency',
  'missing_statement',
  'subscription_price_rise',
  'due_soon',
  'statement_overdue',
  'charged_after_cancel',
];

type Target = 'statements' | 'spending' | 'recurring' | 'installments' | 'rights';

/** Where the user acts on an alert. */
const TARGET: Record<AlertKind, Target> = {
  installment_ending: 'installments',
  limit_high: 'statements',
  interest_charged: 'spending',
  fee_charged: 'rights',
  tax_charged: 'spending',
  foreign_currency: 'spending',
  missing_statement: 'statements',
  subscription_price_rise: 'recurring',
  due_soon: 'statements',
  statement_overdue: 'statements',
  charged_after_cancel: 'recurring',
};

function hrefFor(alert: Alert, target: Target): string {
  if (target === 'spending') {
    const tx = alert.refs.transaction_ids[0];
    return tx ? `/spending/${alert.month}?tx=${encodeURIComponent(tx)}` : `/spending/${alert.month}`;
  }
  return `/${target}`;
}

const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0));

/** Turns an alert into its translated title and sentence. Amounts arrive in minor units; nothing is added up here. */
function useAlertText() {
  const { t } = useTranslation();
  const fmt = useMoneyFormatter();
  const locale = useIntlLocale();
  const whole = (ratio: unknown) => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Number(ratio) * 100);

  return (alert: Alert): { title: string; values: Record<string, string> } | null => {
    if (!KNOWN.includes(alert.kind)) return null;
    const p = alert.params;
    const c = str(p.currency);
    const money = (key: string) => fmt(num(p[key]), c);
    const card = alert.card_label ?? `${bankName(str(p.bank))}, ${t('common.card', { last4: str(p.card_last4) })}`;
    const month = formatMonth(alert.month, locale);
    const base = `overview.alerts.kind.${alert.kind}`;
    switch (alert.kind) {
      case 'installment_ending':
        return {
          title: t(`${base}.title`, { description: str(p.description) }),
          values: { month, amount: money('amount_each') },
        };
      case 'limit_high':
        return {
          title: t(alert.severity === 'critical' ? `${base}.titleFull` : `${base}.title`),
          values: { total: money('statement_total'), limit: money('credit_limit'), share: whole(p.used_share) },
        };
      case 'interest_charged':
      case 'fee_charged':
      case 'tax_charged':
        return { title: t(`${base}.title`), values: { month, total: money('total') } };
      case 'foreign_currency':
        return {
          title: t(`${base}.title`),
          values: { month, total: money('total'), currencies: (Array.isArray(p.currencies) ? p.currencies : [str(p.currencies)]).join(', ') },
        };
      case 'missing_statement': {
        const from = str(p.from) || alert.month;
        const to = str(p.to) || from;
        const count = num(p.months) || 1;
        const range = from === to ? formatMonth(from, locale) : `${formatMonth(from, locale)}–${formatMonth(to, locale)}`;
        return {
          title: t(`${base}.title`, { card }),
          values: { range, count: String(count), what: t(`${base}.what`, { count }) },
        };
      }
      case 'subscription_price_rise':
        return {
          title: t(`${base}.title`, { merchant: str(p.merchant) }),
          values: { previous: money('amount_previous'), last: money('amount_last'), change: whole(p.price_change) },
        };
      case 'due_soon':
        return {
          title: num(p.days_left) <= 0 ? t(`${base}.today`) : t(`${base}.title`, { date: formatDate(str(p.due_date), locale) }),
          values: { total: money('statement_total'), minimum: money('minimum_payment') },
        };
      case 'statement_overdue':
        return { title: t(`${base}.title`, { card }), values: { date: formatDate(str(p.expected_cut_off), locale) } };
      case 'charged_after_cancel':
        return {
          title: t(`${base}.title`, { merchant: str(p.merchant) }),
          values: { date: formatDate(str(p.cancelled_on), locale), total: money('total') },
        };
    }
  };
}

/**
 * Alerts computed by the back end, critical first, as things to do. How much one matters is drawn by the pencil:
 * critical gets the margin mark and the word, a warning gets its title underlined, a note gets nothing.
 * Only the first `limit` rows show; the rest open behind one button.
 */
export function AlertsBody({ limit = 3 }: { limit?: number }) {
  const { t } = useTranslation();
  const alerts = useAlerts();
  const text = useAlertText();
  const locale = useIntlLocale();
  const [showAll, setShowAll] = useState(false);

  if (alerts.isPending) return <p className="text-body text-muted" role="status">{t('common.loading')}</p>;
  if (alerts.isError)
    return (
      <Notice
        tone="warning"
        title={t('overview.alerts.loadError')}
        actions={
          <Button variant="secondary" size="sm" onClick={() => void alerts.refetch()}>
            {t('common.retry')}
          </Button>
        }
      >
        {t('common.loadError')}
      </Notice>
    );

  const items = alerts.data.items;
  if (!items.length) return <p className="text-body text-ink">{t('overview.alerts.none')}</p>;
  const shown = showAll ? items : items.slice(0, limit);
  const rest = items.length - limit;

  return (
    <div>
      <List label={t('overview.alerts.label')}>
        {shown.map((alert) => {
          const view = text(alert);
          const target = TARGET[alert.kind];
          const title = view?.title ?? t('overview.alerts.unknown');
          return (
            <ListRow
              key={alert.id}
              meta={
                alert.card_label ? (
                  <span className="grid gap-0.5">
                    <span>{alert.card_label}</span>
                    <span className="text-muted">{formatMonth(alert.month, locale, 'short')}</span>
                  </span>
                ) : (
                  formatMonth(alert.month, locale, 'short')
                )
              }
              mark={alert.severity === 'critical' ? <MarginMark className="mt-1" /> : undefined}
              title={
                alert.severity === 'critical' ? (
                  <>
                    <span className="mr-2">{t('common.critical')}</span>
                    <span className="font-semibold">{title}</span>
                  </>
                ) : alert.severity === 'warning' ? (
                  <span className="scribble-host relative" data-marked="true">
                    {title}
                    <Scribble seed={alert.id} />
                  </span>
                ) : (
                  title
                )
              }
              detail={view ? <Rich i18nKey={`overview.alerts.kind.${alert.kind}.detail`} values={view.values} /> : null}
              aside={
                target ? (
                  <PencilLink to={hrefFor(alert, target)} seed={`${alert.id}-go`} className="font-semibold">
                    {t(`overview.alerts.go.${target}`)}
                  </PencilLink>
                ) : null
              }
            />
          );
        })}
      </List>
      {rest > 0 ? (
        <TextButton className="mt-5 text-meta" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
          {showAll ? t('overview.alerts.less') : t('overview.alerts.more', { count: rest })}
        </TextButton>
      ) : null}
    </div>
  );
}
