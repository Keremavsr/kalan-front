import { useTranslation } from 'react-i18next';
import { useSubscriptions } from '../../api/queries';
import type { Subscription, SubscriptionsResponse } from '../../api/types';
import { EmptyState, PageHeader, QueryState, Rich, Section, useMoneyFormatter } from '../../components/ui';
import { formatPercent } from '../../lib/format';
import { useIntlLocale } from '../../lib/useLocale';
import { FixedCosts } from './FixedCosts';
import { Subscriptions } from './Subscriptions';

/**
 * Regular payments in two groups: subscriptions (a fixed price you can change or cancel) and bills (utilities whose
 * amount moves). Places you often spend at are not here; they are in the suggestions and on Harcamalar.
 */
export function RecurringPage() {
  const { t } = useTranslation();
  const subs = useSubscriptions();
  const items = subs.data?.items ?? [];
  const subscriptions = items.filter((s) => (s.kind ?? 'subscription') === 'subscription');
  const bills = items.filter((s) => s.kind === 'bill');

  return (
    <>
      <PageHeader title={t('recurring.title')}>{subs.data && items.length ? <RecurringLead data={subs.data} /> : null}</PageHeader>
      <div className="grid gap-12">
        <QueryState query={subs}>
          {() =>
            items.length ? (
              <>
                <Section id="subscriptions" title={t('recurring.subscriptions')} description={t('recurring.subscriptionsIntro')}>
                  {subscriptions.length ? (
                    <Subscriptions items={subscriptions} kind="subscription" />
                  ) : (
                    <p className="text-body text-ink">{t('recurring.noSubscriptions')}</p>
                  )}
                </Section>
                <Section id="bills" title={t('recurring.bills')} description={t('recurring.billsIntro')}>
                  {bills.length ? (
                    <Subscriptions items={bills} kind="bill" />
                  ) : (
                    <p className="text-body text-ink">{t('recurring.noBills')}</p>
                  )}
                </Section>
              </>
            ) : (
              <Section id="subscriptions" title={t('recurring.subscriptions')}>
                <EmptyState mark="empty" title={t('recurring.emptyTitle')}>
                  {t('recurring.rule')}
                </EmptyState>
              </Section>
            )
          }
        </QueryState>
        <FixedCosts />
      </div>
    </>
  );
}

/** Counts, the back end's monthly totals per group and its own price changes; nothing is added up here. */
function RecurringLead({ data }: { data: SubscriptionsResponse }) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const fmt = useMoneyFormatter();
  const items = data.items;
  const subs = items.filter((s) => (s.kind ?? 'subscription') === 'subscription');
  const bills = items.filter((s) => s.kind === 'bill');
  const totals = data.totals?.[0];
  const rises = subs.filter((i: Subscription) => i.price_change && Number(i.price_change) > 0 && !i.expected_amount);
  const list = new Intl.ListFormat(locale, { type: 'conjunction' }).format(
    rises.map((r) => `${r.merchant} (${formatPercent(r.price_change!, locale, { signDisplay: 'exceptZero' })})`),
  );
  return (
    <p>
      {totals ? (
        <Rich
          i18nKey="recurring.leadTotals"
          values={{
            subs: t('recurring.countSubs', { count: subs.length }),
            bills: t('recurring.countBills', { count: bills.length }),
            subTotal: fmt(totals.subscription, totals.currency),
            billTotal: fmt(totals.bill, totals.currency),
          }}
        />
      ) : (
        <Rich i18nKey="recurring.lead" count={items.length} values={{ count: items.length }} />
      )}{' '}
      {rises.length ? t('recurring.leadRise', { list }) : null}
    </p>
  );
}
