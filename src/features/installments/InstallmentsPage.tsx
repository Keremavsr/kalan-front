import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSchedule, useSettings } from '../../api/queries';
import type { Schedule, SchedulePlan } from '../../api/types';
import {
  Card,
  EmptyState,
  KeyValue,
  Money,
  PageHeader,
  QueryState,
  Rich,
  Segmented,
  StackedBar,
  Swatch,
  Table,
  TBody,
  TFoot,
  THead,
  Td,
  Th,
  Tr,
  buttonClass,
  useMoneyFormatter,
} from '../../components/ui';
import { formatMonth, formatMonthName } from '../../lib/format';
import { SERIES_CLASS } from '../../lib/series';
import { useIntlLocale } from '../../lib/useLocale';
import { cx } from '../../lib/cx';
import { EXTRA_SERIES, extraOf, readSchedule, seriesFor } from './schedule';

type Range = '6' | '12';

export function InstallmentsPage() {
  const { t } = useTranslation();
  const settings = useSettings();
  const [range, setRange] = useState<Range | null>(null);
  const effective: Range = range ?? (settings.data?.months_ahead === 6 ? '6' : '12');
  const schedule = useSchedule(Number(effective));
  const hasPlans = Boolean(schedule.data?.plans.length);

  return (
    <>
      <PageHeader
        title={t('installments.title')}
        actions={
          <Segmented<Range>
            label={t('installments.range')}
            value={effective}
            onChange={setRange}
            options={[
              { value: '6', label: t('installments.rangeMonths', { count: 6 }) },
              { value: '12', label: t('installments.rangeMonths', { count: 12 }) },
            ]}
          />
        }
      >
        {schedule.data && hasPlans ? <Lead schedule={schedule.data} /> : null}
      </PageHeader>

      <QueryState query={schedule}>
        {() =>
          schedule.data && hasPlans ? (
            <div className="grid grid-cols-1 gap-8">
              <CommitmentChart schedule={schedule.data} />
              <PlanTable schedule={schedule.data} />
              {schedule.data.plans
                .filter((p) => p.kind === 'cash_advance' && p.breakdown)
                .map((p) => (
                  <CashAdvanceParts key={p.plan_id} plan={p} currency={schedule.data.currency} />
                ))}
            </div>
          ) : (
            <EmptyState
              mark="empty"
              title={t('installments.emptyTitle')}
              action={
                <Link to="/statements" className={buttonClass('secondary')}>
                  {t('nav.statements')}
                </Link>
              }
            >
              {t('installments.empty')}
            </EmptyState>
          )
        }
      </QueryState>
    </>
  );
}

function Lead({ schedule }: { schedule: Schedule }) {
  const fmt = useMoneyFormatter();
  const locale = useIntlLocale();
  const reading = readSchedule(schedule);
  if (!reading.peak) return null;
  const c = schedule.currency;
  return (
    <p>
      <Rich i18nKey="installments.lead" values={{ count: schedule.months.length, amount: fmt(reading.total, c) }} />{' '}
      <Rich
        i18nKey="installments.leadPeak"
        values={{ month: formatMonth(reading.peak.month, locale), amount: fmt(reading.peak.total, c) }}
      />{' '}
      {reading.after ? (
        reading.after.max > 0 ? (
          <Rich
            i18nKey="installments.leadAfter"
            values={{ month: formatMonth(reading.after.month, locale), amount: fmt(reading.after.max, c) }}
          />
        ) : (
          <Rich i18nKey="installments.leadFree" values={{ month: formatMonth(reading.after.month, locale) }} />
        )
      ) : null}
    </p>
  );
}

function MonthLabel({ month, showYear }: { month: string; showYear: boolean }) {
  const locale = useIntlLocale();
  return (
    <>
      <span className="block">{formatMonthName(month, locale)}</span>
      <span className={cx('block text-meta font-normal text-muted', !showYear && 'invisible')}>{month.slice(0, 4)}</span>
    </>
  );
}

/** Monthly columns in the plan pigments; the amount sits on top of each column like the bar labels of the site. */
function CommitmentChart({ schedule }: { schedule: Schedule }) {
  const { t } = useTranslation();
  const max = Math.max(1, ...schedule.months.map((m) => m.total));
  const planIndex = new Map(schedule.plans.map((p, i) => [p.plan_id, i]));
  const planById = new Map(schedule.plans.map((p) => [p.plan_id, p]));
  const hasTax = schedule.plans.some((p) => p.breakdown);

  return (
    <Card title={t('installments.chartTitle')}>
      <figure>
        <div role="img" aria-label={t('installments.chartLabel')} className="flex h-64 items-end gap-2 border-b border-ink">
          {schedule.months.map((m) => (
            <div key={m.month} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
              <span className="mb-1.5 text-meta font-semibold whitespace-nowrap text-ink">
                {m.total ? <Money minor={m.total} currency={schedule.currency} bare /> : '–'}
              </span>
              <div
                className="bar-y flex w-full max-w-14 flex-col-reverse overflow-hidden rounded-t-bar"
                style={{ height: `${(m.total / max) * 80}%` }}
              >
                {m.items.map((item, i) => {
                  const plan = planById.get(item.plan_id);
                  const series = plan ? seriesFor(plan, planIndex.get(item.plan_id) ?? 0) : 'prusya';
                  const extra = item.breakdown ? extraOf(item.breakdown) : 0;
                  return (
                    <div
                      key={item.plan_id}
                      className={cx('flex flex-col', i > 0 && 'border-b-2 border-paper')}
                      style={{ flexGrow: item.amount, flexBasis: 0 }}
                    >
                      {extra ? <div className={SERIES_CLASS[EXTRA_SERIES].fill} style={{ flexGrow: extra, flexBasis: 0 }} /> : null}
                      <div className={SERIES_CLASS[series].fill} style={{ flexGrow: item.amount - extra, flexBasis: 0 }} />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-2" aria-hidden>
          {schedule.months.map((m, i) => (
            <div key={m.month} className="min-w-0 flex-1 text-center text-meta font-semibold text-ink">
              <MonthLabel month={m.month} showYear={i === 0 || m.month.endsWith('-01')} />
            </div>
          ))}
        </div>
        <figcaption className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-meta text-ink">
          <span className="sr-only">{t('installments.legend')}</span>
          {schedule.plans.map((p, i) => (
            <span key={p.plan_id} className="inline-flex items-center gap-2">
              <Swatch series={seriesFor(p, i)} />
              {p.description}
            </span>
          ))}
          {hasTax ? (
            <span className="inline-flex items-center gap-2">
              <Swatch series={EXTRA_SERIES} />
              {t('installments.legendTax')}
            </span>
          ) : null}
        </figcaption>
      </figure>
    </Card>
  );
}

/** Plan rows by month. The table scrolls inside its card; the plan column stays put. */
function PlanTable({ schedule }: { schedule: Schedule }) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const fmt = useMoneyFormatter();
  const c = schedule.currency;
  const cells = new Map<string, { amount: number; index: number; count: number }>();
  for (const m of schedule.months) for (const it of m.items) cells.set(`${it.plan_id}|${m.month}`, it);

  return (
    <Card title={t('installments.planTitle')} description={t('installments.planCaption')} flush>
      <Table caption={t('installments.planTitle')} captionHidden tableClassName="min-w-max" className="mt-1">
        <THead>
          <Tr>
            <Th sticky className="w-64 min-w-64">
              {t('installments.colPlan')}
            </Th>
            {schedule.months.map((m, i) => (
              <Th key={m.month} numeric className="min-w-22 px-2">
                <span className="sr-only">{formatMonth(m.month, locale)}</span>
                <span aria-hidden>
                  <MonthLabel month={m.month} showYear={i === 0 || m.month.endsWith('-01')} />
                </span>
              </Th>
            ))}
          </Tr>
        </THead>
        <TBody>
          {schedule.plans.map((plan, pi) => {
            const series = seriesFor(plan, pi);
            return (
              <Tr key={plan.plan_id}>
                <Th scope="row" sticky className="w-64 min-w-64 font-normal">
                  <span className="flex items-start gap-2.5">
                    <Swatch series={series} className="mt-1.5" />
                    <span className="min-w-0">
                      <span className="block font-semibold">{plan.description}</span>
                      <span className="block text-meta text-muted">
                        {t(`installments.kind.${plan.kind}`)} · {t('common.left', { count: plan.remaining_count })}
                      </span>
                      <span className="block text-meta text-muted">
                        <Rich i18nKey="installments.remainingTotal" values={{ amount: fmt(plan.total_remaining, c) }} />
                      </span>
                    </span>
                  </span>
                </Th>
                {schedule.months.map((m) => {
                  const cell = cells.get(`${plan.plan_id}|${m.month}`);
                  const isLast = cell && cell.index === cell.count;
                  return (
                    <Td key={m.month} numeric className="relative px-2">
                      {cell ? (
                        <>
                          <Money minor={cell.amount} currency={c} bare />
                          <span className={cx('block text-meta', isLast ? 'font-bold text-ink' : 'text-muted')}>
                            {t('installments.cellIndex', { index: cell.index, count: cell.count })}
                          </span>
                          <span
                            aria-hidden
                            className={cx('absolute bottom-0 left-0 h-1', SERIES_CLASS[series].fill, isLast ? 'right-2 rounded-r-bar' : 'right-0')}
                          />
                        </>
                      ) : null}
                    </Td>
                  );
                })}
              </Tr>
            );
          })}
        </TBody>
        <TFoot>
          <Tr>
            <Th scope="row" sticky className="font-bold">
              {t('installments.totalRow')}
            </Th>
            {schedule.months.map((m) => (
              <Td key={m.month} numeric className="px-2 font-bold">
                {m.total ? <Money minor={m.total} currency={c} bare /> : <span className="text-muted">–</span>}
              </Td>
            ))}
          </Tr>
        </TFoot>
      </Table>
    </Card>
  );
}

function CashAdvanceParts({ plan, currency }: { plan: SchedulePlan; currency: string }) {
  const { t } = useTranslation();
  const fmt = useMoneyFormatter();
  const locale = useIntlLocale();
  const b = plan.breakdown!;
  const extra = extraOf(b);
  const pct = (part: number) =>
    new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(part / plan.amount_each);
  const parts = [
    { key: 'principal', k: 'A', label: t('installments.partPrincipal'), long: null, amount: b.principal, series: seriesFor(plan, 0) },
    { key: 'interest', k: 'F', label: t('installments.partInterest'), long: null, amount: b.interest, series: EXTRA_SERIES },
    { key: 'bsmv', k: 'B', label: t('installments.partBsmv'), long: t('installments.partBsmvLong'), amount: b.bsmv, series: EXTRA_SERIES },
    { key: 'kkdf', k: 'K', label: t('installments.partKkdf'), long: t('installments.partKkdfLong'), amount: b.kkdf, series: EXTRA_SERIES },
  ];

  return (
    <Card title={t('installments.cashTitle')} description={t('installments.cashCaption', { plan: plan.description })}>
      <p className="max-w-measure text-body text-ink">
        <Rich
          i18nKey="installments.cashLead"
          values={{ extra: fmt(extra, currency), totalExtra: fmt(extra * plan.remaining_count, currency), count: plan.remaining_count }}
        />
      </p>
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <StackedBar
          label={parts.map((p) => `${p.label} ${fmt(p.amount, currency)}`).join(', ')}
          parts={parts.map((p) => ({ key: p.key, value: p.amount, series: p.series, label: pct(p.amount) }))}
          aside={
            <>
              {t('installments.partTotal')}: <Money minor={plan.amount_each} currency={currency} className="font-bold" />
            </>
          }
          caption={parts.map((p) => `${p.label} ${pct(p.amount)}`).join(', ')}
        />
        <KeyValue
          items={parts.map((p) => ({
            k: p.k,
            label: (
              <>
                <span className="block">{p.label}</span>
                {p.long ?<span className="block text-muted">{p.long}</span> : null}
              </>
            ),
            value: <Money minor={p.amount} currency={currency} />,
          }))}
        />
      </div>
    </Card>
  );
}
