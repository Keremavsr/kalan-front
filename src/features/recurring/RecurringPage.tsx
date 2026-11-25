import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSubscriptions } from '../../api/queries';
import type { Subscription } from '../../api/types';
import { EmptyState, List, ListRow, Money, PageHeader, QueryState, Rich, useMoneyFormatter } from '../../components/ui';
import { formatMonthName, formatPercent } from '../../lib/format';
import { useIntlLocale } from '../../lib/useLocale';

export function RecurringPage() {
  const { t } = useTranslation();
  const subs = useSubscriptions();
  const items = subs.data?.items ?? [];

  return (
    <>
      <PageHeader title={t('recurring.title')}>{items.length ? <RecurringLead items={items} /> : null}</PageHeader>
      <QueryState query={subs}>
        {() =>
          items.length ? (
            <div className="grid grid-cols-1 gap-6">
              <List label={t('recurring.listLabel')}>
                {items.map((s) => (
                  <RecurringRow key={s.merchant} item={s} />
                ))}
              </List>
              <p className="max-w-measure text-meta text-muted">{t('recurring.rule')}</p>
            </div>
          ) : (
            <EmptyState mark="empty" title={t('recurring.emptyTitle')}>
              {t('recurring.rule')}
            </EmptyState>
          )
        }
      </QueryState>
    </>
  );
}

function RecurringLead({ items }: { items: Subscription[] }) {
  const { t } = useTranslation();
  const fmt = useMoneyFormatter();
  const locale = useIntlLocale();
  const currency = items[0]?.currency ?? 'TRY';
  const total = items.reduce((s, i) => s + i.amount_last, 0);
  const rises = items.filter((i) => i.price_change && Number(i.price_change) > 0);
  const list = new Intl.ListFormat(locale, { type: 'conjunction' }).format(
    rises.map((r) => `${r.merchant} (${formatPercent(r.price_change!, locale, { signDisplay: 'exceptZero' })})`),
  );
  return (
    <p>
      <Rich i18nKey="recurring.lead" count={items.length} values={{ count: items.length, amount: fmt(total, currency) }} />{' '}
      {rises.length ? t('recurring.leadRise', { list }) : t('recurring.leadNoRise')}
    </p>
  );
}

/** One charge: how long it has come on the left, the merchant and the months in the middle, the price and its change on the right. */
function RecurringRow({ item: s }: { item: Subscription }) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const fmt = useMoneyFormatter();
  const change = s.price_change ? Number(s.price_change) : 0;
  const diff = s.amount_last - s.amount_previous;
  const months = s.months_seen.map((m) => `${formatMonthName(m, locale)} ${m.slice(2, 4)}`).join(', ');
  return (
    <ListRow
      meta={t('recurring.seen', { count: s.months_seen.length })}
      title={s.merchant}
      detail={
        <span className="text-meta text-muted">
          {months} · {t('recurring.previous', { amount: fmt(s.amount_previous, s.currency) })}
        </span>
      }
      aside={
        <span className="grid justify-items-end gap-0.5">
          <Money minor={s.amount_last} currency={s.currency} className="text-lead font-bold" />
          {change > 0 ? (
            <span className="inline-flex items-center gap-1 font-semibold">
              <ArrowUpRight aria-hidden className="size-3.5" />
              {formatPercent(s.price_change!, locale, { signDisplay: 'exceptZero' })}
              <span className="font-normal text-muted">
                · {t('recurring.yearly', { amount: fmt(diff * 12, s.currency, { signDisplay: 'exceptZero' }) })}
              </span>
            </span>
          ) : change < 0 ? (
            <span className="inline-flex items-center gap-1 font-semibold">
              <ArrowDownRight aria-hidden className="size-3.5" />
              {formatPercent(s.price_change!, locale, { signDisplay: 'exceptZero' })}
            </span>
          ) : (
            <span className="text-muted">{t('recurring.same')}</span>
          )}
        </span>
      }
    />
  );
}
