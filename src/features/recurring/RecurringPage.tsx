import { useTranslation } from 'react-i18next';
import { useSubscriptions } from '../../api/queries';
import type { Subscription } from '../../api/types';
import { EmptyState, PageHeader, QueryState, Rich, Section } from '../../components/ui';
import { formatPercent } from '../../lib/format';
import { useIntlLocale } from '../../lib/useLocale';
import { FixedCosts } from './FixedCosts';
import { Subscriptions } from './Subscriptions';

export function RecurringPage() {
  const { t } = useTranslation();
  const subs = useSubscriptions();
  const items = subs.data?.items ?? [];

  return (
    <>
      <PageHeader title={t('recurring.title')}>{items.length ? <RecurringLead items={items} /> : null}</PageHeader>
      <div className="grid gap-12">
        <Section id="subscriptions" title={t('recurring.subscriptions')}>
          <QueryState query={subs}>
            {() =>
              items.length ? (
                <Subscriptions items={items} />
              ) : (
                <EmptyState mark="empty" title={t('recurring.emptyTitle')}>
                  {t('recurring.rule')}
                </EmptyState>
              )
            }
          </QueryState>
        </Section>
        <FixedCosts />
      </div>
    </>
  );
}

/** Counts and the back end's own price changes; no amount is added up on this side. */
function RecurringLead({ items }: { items: Subscription[] }) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const rises = items.filter((i) => i.price_change && Number(i.price_change) > 0);
  const list = new Intl.ListFormat(locale, { type: 'conjunction' }).format(
    rises.map((r) => `${r.merchant} (${formatPercent(r.price_change!, locale, { signDisplay: 'exceptZero' })})`),
  );
  return (
    <p>
      <Rich i18nKey="recurring.lead" count={items.length} values={{ count: items.length }} />{' '}
      {rises.length ? t('recurring.leadRise', { list }) : t('recurring.leadNoRise')}
    </p>
  );
}
