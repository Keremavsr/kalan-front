import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSchedule, useSettings } from '../../api/queries';
import type { Schedule, SchedulePlan } from '../../api/types';
import {
  Button,
  Card,
  Money,
  Notice,
  PageHeader,
  QueryState,
  Rich,
  Segmented,
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
import { useIntlLocale } from '../../lib/useLocale';
import { cx } from '../../lib/cx';
import { ManualEntryModal } from '../manual/ManualEntryModal';
import { extraOf, readSchedule, seriesFor } from './schedule';

type Range = '6' | '12';

export function CalendarPage() {
  const { t } = useTranslation();
  const settings = useSettings();
  const [range, setRange] = useState<Range | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const effective: Range = range ?? (settings.data?.months_ahead === 6 ? '6' : '12');
  const schedule = useSchedule(Number(effective));

  return (
    <>
      <PageHeader
        title={t('calendar.title')}
        actions={
          <>
            <Segmented<Range>
              label={t('calendar.range')}
              value={effective}
              onChange={setRange}
              options={[
                { value: '6', label: t('calendar.rangeMonths', { count: 6 }) },
                { value: '12', label: t('calendar.rangeMonths', { count: 12 }) },
              ]}
            />
            <Button variant="primary" icon={<Plus aria-hidden className="size-4" />} onClick={() => setManualOpen(true)}>
              {t('calendar.add')}
            </Button>
          </>
        }
      >
        {schedule.data ? <Lead schedule={schedule.data} /> : null}
      </PageHeader>

      <QueryState query={schedule}>
        {() =>
          schedule.data && schedule.data.plans.length ? (
            <div className="space-y-8">
              <CommitmentChart schedule={schedule.data} />
              <PlanTable schedule={schedule.data} />
              {schedule.data.plans
                .filter((p) => p.kind === 'cash_advance' && p.breakdown)
                .map((p) => (
                  <CashAdvanceParts key={p.plan_id} plan={p} currency={schedule.data.currency} />
                ))}
            </div>
          ) : (
            <Notice
              title={t('calendar.empty')}
              actions={
                <Link to="/upload" className={buttonClass('secondary', 'sm')}>
                  {t('nav.upload')}
                </Link>
              }
            />
          )
        }
      </QueryState>

      <ManualEntryModal open={manualOpen} onClose={() => setManualOpen(false)} />
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
      <Rich i18nKey="calendar.lead" values={{ count: schedule.months.length, amount: fmt(reading.total, c) }} />{' '}
      <Rich
        i18nKey="calendar.leadPeak"
        values={{ month: formatMonth(reading.peak.month, locale), amount: fmt(reading.peak.total, c) }}
      />{' '}
      {reading.after ? (
        reading.after.max > 0 ? (
          <Rich
            i18nKey="calendar.leadAfter"
            values={{ month: formatMonth(reading.after.month, locale), amount: fmt(reading.after.max, c) }}
          />
        ) : (
          <Rich i18nKey="calendar.leadFree" values={{ month: formatMonth(reading.after.month, locale) }} />
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
      <span className={cx('block font-mono text-micro text-ink-muted', !showYear && 'invisible')}>{month.slice(0, 4)}</span>
    </>
  );
}

function CommitmentChart({ schedule }: { schedule: Schedule }) {
  const { t } = useTranslation();
  const max = Math.max(1, ...schedule.months.map((m) => m.total));
  const planIndex = new Map(schedule.plans.map((p, i) => [p.plan_id, i]));
  const planById = new Map(schedule.plans.map((p) => [p.plan_id, p]));
  const hasTax = schedule.plans.some((p) => p.breakdown);

  return (
    <Card>
      <figure>
        <div role="img" aria-label={t('calendar.chartLabel')} className="flex h-60 items-end gap-2 border-b border-line-strong">
          {schedule.months.map((m) => (
            <div key={m.month} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
              <span className="mb-1.5 font-mono text-micro whitespace-nowrap text-ink-muted tabular">
                {m.total ? <Money minor={m.total} currency={schedule.currency} bare /> : '–'}
              </span>
              <div
                className="bar-grow flex w-full max-w-12 flex-col-reverse gap-px overflow-hidden rounded-t-sm"
                style={{ height: `${(m.total / max) * 82}%` }}
              >
                {m.items.map((item) => {
                  const plan = planById.get(item.plan_id);
                  const color = plan ? seriesFor(plan, planIndex.get(item.plan_id) ?? 0) : 'bg-series-1';
                  const extra = item.breakdown ? extraOf(item.breakdown) : 0;
                  return (
                    <div key={item.plan_id} className="flex flex-col" style={{ flexGrow: item.amount, flexBasis: 0 }}>
                      {extra ? <div className="bg-series-tax" style={{ flexGrow: extra, flexBasis: 0 }} /> : null}
                      <div className={color} style={{ flexGrow: item.amount - extra, flexBasis: 0 }} />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-2" aria-hidden>
          {schedule.months.map((m, i) => (
            <div key={m.month} className="min-w-0 flex-1 text-center text-xs text-ink">
              <MonthLabel month={m.month} showYear={i === 0 || m.month.endsWith('-01')} />
            </div>
          ))}
        </div>
        <figcaption className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink-muted">
          <span className="sr-only">{t('calendar.legend')}</span>
          {schedule.plans.map((p, i) => (
            <span key={p.plan_id} className="inline-flex items-center gap-1.5">
              <span aria-hidden className={cx('size-2.5 rounded-xs', seriesFor(p, i))} />
              {p.description}
            </span>
          ))}
          {hasTax ? (
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 rounded-xs bg-series-tax" />
              {t('calendar.legendTax')}
            </span>
          ) : null}
        </figcaption>
      </figure>
    </Card>
  );
}

function PlanTable({ schedule }: { schedule: Schedule }) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const fmt = useMoneyFormatter();
  const c = schedule.currency;
  const cells = new Map<string, { amount: number; index: number; count: number }>();
  for (const m of schedule.months) for (const it of m.items) cells.set(`${it.plan_id}|${m.month}`, it);

  return (
    <Card title={t('calendar.planTitle')} description={t('calendar.planCaption')} flush>
      <Table caption={t('calendar.planTitle')} captionHidden tableClassName="min-w-5xl">
        <THead>
          <Tr>
            <Th className="w-60 min-w-60">{t('calendar.colPlan')}</Th>
            {schedule.months.map((m, i) => (
              <Th key={m.month} numeric className="px-1.5">
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
            const color = seriesFor(plan, pi);
            return (
              <Tr key={plan.plan_id}>
                <Th scope="row" className="py-3 font-normal">
                  <span className="flex items-start gap-2">
                    <span aria-hidden className={cx('mt-1.5 size-2.5 shrink-0 rounded-xs', color)} />
                    <span className="min-w-0">
                      <span className="block font-medium">{plan.description}</span>
                      <span className="block text-xs text-ink-muted">
                        {t(`calendar.kind.${plan.kind}`)} · {t('common.left', { count: plan.remaining_count })}
                      </span>
                      <span className="block text-xs text-ink-muted">
                        <Rich i18nKey="calendar.remainingTotal" values={{ amount: fmt(plan.total_remaining, c) }} />
                      </span>
                    </span>
                  </span>
                </Th>
                {schedule.months.map((m) => {
                  const cell = cells.get(`${plan.plan_id}|${m.month}`);
                  const isLast = cell && cell.index === cell.count;
                  return (
                    <Td key={m.month} numeric className="relative px-1.5 py-3 text-xs">
                      {cell ? (
                        <>
                          <Money minor={cell.amount} currency={c} bare />
                          <span className={cx('block text-micro', isLast ? 'font-medium text-ink' : 'text-ink-muted')}>
                            {t('calendar.cellIndex', { index: cell.index, count: cell.count })}
                          </span>
                          <span
                            aria-hidden
                            className={cx('absolute bottom-0 left-0 h-0.5', color, isLast ? 'right-1.5 rounded-r-full' : 'right-0')}
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
            <Th scope="row" className="py-3 font-semibold">
              {t('calendar.totalRow')}
            </Th>
            {schedule.months.map((m) => (
              <Td key={m.month} numeric className="px-1.5 py-3 text-xs font-medium">
                {m.total ? <Money minor={m.total} currency={c} bare /> : <span className="text-ink-muted">–</span>}
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
    { key: 'principal', label: t('calendar.partPrincipal'), long: null, amount: b.principal, color: 'bg-series-cash' },
    { key: 'interest', label: t('calendar.partInterest'), long: null, amount: b.interest, color: 'bg-series-tax' },
    { key: 'bsmv', label: t('calendar.partBsmv'), long: t('calendar.partBsmvLong'), amount: b.bsmv, color: 'bg-series-tax' },
    { key: 'kkdf', label: t('calendar.partKkdf'), long: t('calendar.partKkdfLong'), amount: b.kkdf, color: 'bg-series-tax' },
  ];

  return (
    <Card title={t('calendar.cashTitle')} description={t('calendar.cashCaption', { plan: plan.description })}>
      <p className="max-w-3xl text-ink">
        <Rich
          i18nKey="calendar.cashLead"
          values={{ extra: fmt(extra, currency), totalExtra: fmt(extra * plan.remaining_count, currency), count: plan.remaining_count }}
        />
      </p>
      <div className="mt-4 flex h-2.5 gap-px overflow-hidden rounded-full" aria-hidden>
        {parts.map((p) => (
          <div key={p.key} className={p.color} style={{ flexGrow: p.amount, flexBasis: 0 }} />
        ))}
      </div>
      <Table caption={t('calendar.cashCaption', { plan: plan.description })} captionHidden className="-mx-5 mt-4">
        <THead>
          <Tr>
            <Th>{t('calendar.colPlan')}</Th>
            <Th numeric>{t('calendar.partShare')}</Th>
            <Th numeric>{t('month.colAmount')}</Th>
          </Tr>
        </THead>
        <TBody>
          {parts.map((p) => (
            <Tr key={p.key}>
              <Th scope="row" className="text-sm font-normal text-ink">
                <span className="font-medium">{p.label}</span>
                {p.long ? <span className="ml-2 text-ink-muted">{p.long}</span> : null}
              </Th>
              <Td numeric className="text-ink-muted">
                {pct(p.amount)}
              </Td>
              <Td numeric>
                <Money minor={p.amount} currency={currency} />
              </Td>
            </Tr>
          ))}
        </TBody>
        <TFoot>
          <Tr>
            <Th scope="row" className="text-sm font-semibold text-ink">
              {t('calendar.partTotal')}
            </Th>
            <Td numeric />
            <Td numeric className="font-medium">
              <Money minor={plan.amount_each} currency={currency} />
            </Td>
          </Tr>
        </TFoot>
      </Table>
    </Card>
  );
}
