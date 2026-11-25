import { ArrowUpRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSubscriptions } from '../../api/queries';
import type { Subscription } from '../../api/types';
import {
  Card,
  Money,
  Notice,
  PageHeader,
  QueryState,
  Rich,
  Table,
  TBody,
  THead,
  Td,
  Th,
  Tr,
  useMoneyFormatter,
} from '../../components/ui';
import { formatMonthName, formatPercent } from '../../lib/format';
import { useIntlLocale } from '../../lib/useLocale';

export function SubscriptionsPage() {
  const { t } = useTranslation();
  const subs = useSubscriptions();
  const items = subs.data?.items ?? [];

  return (
    <>
      <PageHeader title={t('subscriptions.title')}>{items.length ? <SubsLead items={items} /> : null}</PageHeader>
      <QueryState query={subs}>
        {() =>
          items.length ? (
            <div className="space-y-4">
              <SubsTable items={items} />
              <p className="max-w-3xl text-sm text-ink-muted">{t('subscriptions.rule')}</p>
            </div>
          ) : (
            <Notice title={t('subscriptions.empty')}>{t('subscriptions.rule')}</Notice>
          )
        }
      </QueryState>
    </>
  );
}

function SubsLead({ items }: { items: Subscription[] }) {
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
      <Rich i18nKey="subscriptions.lead" count={items.length} values={{ count: items.length, amount: fmt(total, currency) }} />{' '}
      {rises.length ? t('subscriptions.leadRise', { list }) : t('subscriptions.leadNoRise')}
    </p>
  );
}

function SubsTable({ items }: { items: Subscription[] }) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  return (
    <Card flush className="pt-1">
      <Table caption={t('subscriptions.title')} captionHidden>
        <THead>
          <Tr>
            <Th>{t('subscriptions.colMerchant')}</Th>
            <Th>{t('subscriptions.colMonths')}</Th>
            <Th numeric>{t('subscriptions.colPrevious')}</Th>
            <Th numeric>{t('subscriptions.colLast')}</Th>
            <Th numeric>{t('subscriptions.colChange')}</Th>
          </Tr>
        </THead>
        <TBody>
          {items.map((s) => {
            const change = s.price_change ? Number(s.price_change) : 0;
            const diff = s.amount_last - s.amount_previous;
            return (
              <Tr key={s.merchant}>
                <Th scope="row" className="text-sm font-medium text-ink">
                  {s.merchant}
                </Th>
                <Td className="text-ink-muted">
                  {s.months_seen.map((m) => `${formatMonthName(m, locale)} ${m.slice(2, 4)}`).join(', ')}
                </Td>
                <Td numeric className="text-ink-muted">
                  <Money minor={s.amount_previous} currency={s.currency} />
                </Td>
                <Td numeric>
                  <Money minor={s.amount_last} currency={s.currency} />
                </Td>
                <Td numeric>
                  {change > 0 ? (
                    <span className="inline-flex flex-col items-end">
                      <span className="inline-flex items-center gap-1 font-medium text-negative">
                        <ArrowUpRight aria-hidden className="size-3.5" />
                        {formatPercent(s.price_change!, locale, { signDisplay: 'exceptZero' })}
                      </span>
                      <span className="text-xs text-ink-muted">
                        <YearlyDiff diff={diff} currency={s.currency} />
                      </span>
                    </span>
                  ) : change < 0 ? (
                    <span className="text-positive">{formatPercent(s.price_change!, locale, { signDisplay: 'exceptZero' })}</span>
                  ) : (
                    <span className="font-body text-ink-muted">{t('subscriptions.same')}</span>
                  )}
                </Td>
              </Tr>
            );
          })}
        </TBody>
      </Table>
    </Card>
  );
}

function YearlyDiff({ diff, currency }: { diff: number; currency: string }) {
  const { t } = useTranslation();
  const fmt = useMoneyFormatter();
  return <>{t('subscriptions.yearly', { amount: fmt(diff * 12, currency, { signDisplay: 'exceptZero' }) })}</>;
}
