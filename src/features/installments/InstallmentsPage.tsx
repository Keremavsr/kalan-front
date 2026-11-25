import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useEarlyPayoffOverview, useSchedule, useSettings, useSimulateInstallment } from '../../api/queries';
import type { ClosedEarly, Schedule, SchedulePlan, Simulation, SimulationRequest } from '../../api/types';
import { PencilLink } from '../../components/pencil';
import {
  Card,
  EmptyState,
  Money,
  PageHeader,
  QueryState,
  Rich,
  Section,
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
import { TextButton } from '../../components/ui/TextButton';
import { EarlyPayoffDialog } from './EarlyPayoff';
import { EXTRA_SERIES, extraOf, readSchedule, seriesFor } from './schedule';
import { ShareCardBody } from './ShareCard';
import { SimulateForm } from './Simulate';
import { WhichCardBody } from './WhichCard';

type Range = '6' | '12';

/** The hatched, framed slice of a what-if purchase. The pattern is drawn in ink from the token. */
const SIM_HATCH = { backgroundImage: 'repeating-linear-gradient(135deg, var(--color-ink) 0 1px, transparent 1px 6px)' };

export function InstallmentsPage() {
  const { t } = useTranslation();
  const settings = useSettings();
  const [range, setRange] = useState<Range | null>(null);
  const effective: Range = range ?? (settings.data?.months_ahead === 6 ? '6' : '12');
  const schedule = useSchedule(Number(effective));
  const hasPlans = Boolean(schedule.data?.plans.length);
  const [simBody, setSimBody] = useState<SimulationRequest | undefined>(undefined);
  const simRequest = simBody ? { ...simBody, months: Number(effective) } : undefined;
  const sim = useSimulateInstallment(simRequest);

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
              <CommitmentChart schedule={schedule.data} sim={simBody ? sim.data : undefined}>
                <div className="mt-8 border-t border-ink pt-6">
                  <h3 className="mb-2 text-title font-bold text-ink">{t('installments.sim.title')}</h3>
                  <SimulateForm
                    schedule={schedule.data}
                    months={Number(effective)}
                    body={simBody}
                    query={sim}
                    onSubmit={setSimBody}
                    onClear={() => setSimBody(undefined)}
                  />
                </div>
              </CommitmentChart>
              <PlanTable schedule={schedule.data} />
              {schedule.data.plans
                .filter((p) => p.kind === 'cash_advance' && p.breakdown)
                .map((p) => (
                  <CashAdvanceParts key={p.plan_id} plan={p} schedule={schedule.data} />
                ))}
              <Section id="which" title={t('installments.which.title')} description={t('installments.which.description')}>
                <WhichCardBody />
              </Section>
              <Section id="share" title={t('installments.share.title')} description={t('installments.share.description')}>
                <ShareCardBody />
              </Section>
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

/**
 * Monthly columns in the plan pigments; the amount sits on top of each column like the bar labels of the site.
 * A what-if purchase is drawn on top of each month as a framed, hatched slice, and the label shows the new total
 * the back end returned (`with`).
 */
function CommitmentChart({ schedule, sim, children }: { schedule: Schedule; sim: Simulation | undefined; children?: ReactNode }) {
  const { t } = useTranslation();
  const fmt = useMoneyFormatter();
  const simByMonth = new Map((sim?.months ?? []).map((m) => [m.month, m]));
  const columns = schedule.months.map((m) => {
    const s = simByMonth.get(m.month);
    return { ...m, purchase: s?.purchase ?? 0, shown: s ? s.with : m.total };
  });
  const max = Math.max(1, ...columns.map((m) => m.shown));
  const planIndex = new Map(schedule.plans.map((p, i) => [p.plan_id, i]));
  const planById = new Map(schedule.plans.map((p) => [p.plan_id, p]));
  const hasTax = schedule.plans.some((p) => p.breakdown);
  const hasSim = columns.some((m) => m.purchase > 0);

  return (
    <Card title={t('installments.chartTitle')}>
      <figure>
        <div
          role="img"
          aria-label={hasSim ? t('installments.sim.chartLabel') : t('installments.chartLabel')}
          className="flex h-64 items-end gap-2 border-b border-ink"
        >
          {columns.map((m) => (
            <div key={m.month} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
              <span className="mb-1.5 text-meta font-semibold whitespace-nowrap text-ink">
                {m.shown ? <Money minor={m.shown} currency={schedule.currency} bare /> : '–'}
              </span>
              <div
                className="bar-y flex w-full max-w-14 flex-col-reverse overflow-hidden rounded-t-bar transition-[height] duration-(--duration-2) ease-(--ease-out)"
                style={{ height: `${(m.shown / max) * 80}%` }}
              >
                {m.items.map((item, i) => {
                  const plan = planById.get(item.plan_id);
                  const series = plan ? seriesFor(plan, planIndex.get(item.plan_id) ?? 0, schedule.plans) : 'prusya';
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
                {m.purchase ? (
                  <div
                    data-sim-slice
                    title={fmt(m.purchase, schedule.currency)}
                    className={cx('enter border-[1.5px] border-ink bg-paper', m.items.length > 0 && 'border-b-paper')}
                    style={{ ...SIM_HATCH, flexGrow: m.purchase, flexBasis: 0 }}
                  />
                ) : null}
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
              <Swatch series={seriesFor(p, i, schedule.plans)} />
              {p.description}
            </span>
          ))}
          {hasTax ? (
            <span className="inline-flex items-center gap-2">
              <Swatch series={EXTRA_SERIES} />
              {t('installments.legendTax')}
            </span>
          ) : null}
          {hasSim ? (
            <span className="inline-flex items-center gap-2 font-semibold">
              <span aria-hidden className="inline-block size-3 shrink-0 rounded-swatch border border-ink bg-paper" style={SIM_HATCH} />
              {t('installments.sim.legend')}
            </span>
          ) : null}
        </figcaption>
      </figure>
      {children}
    </Card>
  );
}

/** Plan rows by month. The table scrolls inside its card; the plan column stays put. */
function PlanTable({ schedule }: { schedule: Schedule }) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const fmt = useMoneyFormatter();
  const overview = useEarlyPayoffOverview();
  const [payoffPlan, setPayoffPlan] = useState<SchedulePlan | null>(null);
  const c = schedule.currency;
  const cells = new Map<string, { amount: number; index: number; count: number }>();
  for (const m of schedule.months) for (const it of m.items) cells.set(`${it.plan_id}|${m.month}`, it);
  const closed = overview.data?.closed_early ?? [];
  const closedIds = new Set(closed.map((x) => x.plan_id));
  const planIds = new Set(schedule.plans.map((p) => p.plan_id));
  const closedElsewhere = closed.filter((x) => !planIds.has(x.plan_id));

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
            const series = seriesFor(plan, pi, schedule.plans);
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
                      {closedIds.has(plan.plan_id) ? (
                        <span className="block text-meta font-semibold text-ink">{t('installments.payoff.closed')}</span>
                      ) : null}
                      <TextButton
                        className="mt-2 text-meta"
                        seed={plan.plan_id}
                        aria-label={t('installments.payoff.openLabel', { plan: plan.description })}
                        onClick={() => setPayoffPlan(plan)}
                      >
                        {t('installments.payoff.open')}
                      </TextButton>
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
      {closedElsewhere.length ? <ClosedEarlyList items={closedElsewhere} /> : null}
      <EarlyPayoffDialog plan={payoffPlan} months={schedule.months.map((m) => m.month)} onClose={() => setPayoffPlan(null)} />
    </Card>
  );
}

/** Plans a statement already shows as closed before their last installment. */
function ClosedEarlyList({ items }: { items: ClosedEarly[] }) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  return (
    <div className="mx-6 mt-2 mb-6 border-t border-ink pt-4">
      <h3 className="text-meta font-semibold text-ink">{t('installments.payoff.closedTitle')}</h3>
      <ul className="mt-2">
        {items.map((x) => (
          <li key={`${x.plan_id}-${x.transaction_id}`} className="flex flex-wrap items-baseline gap-x-4 border-b border-line py-2 text-table text-ink">
            <span>
              {x.index && x.total_count
                ? t('installments.payoff.closedRow', { month: formatMonth(x.month, locale), index: x.index, count: x.total_count })
                : t('installments.payoff.closedRowNoIndex', { month: formatMonth(x.month, locale) })}
            </span>
            <PencilLink to={`/spending/${x.month}?tx=${encodeURIComponent(x.transaction_id)}`} className="text-meta font-semibold">
              {t('installments.payoff.closedLink')}
            </PencilLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * What a cash advance still costs. The plan's `breakdown` splits the remaining total (not one month);
 * each schedule item carries its own month's split. Both come from the back end as they are.
 */
function CashAdvanceParts({ plan, schedule }: { plan: SchedulePlan; schedule: Schedule }) {
  const { t } = useTranslation();
  const fmt = useMoneyFormatter();
  const locale = useIntlLocale();
  const c = schedule.currency;
  const b = plan.breakdown!;
  const next = schedule.months
    .map((m) => ({ month: m.month, item: m.items.find((it) => it.plan_id === plan.plan_id) }))
    .find((x) => x.item?.breakdown);
  const nb = next?.item?.breakdown ?? null;
  const pct = (part: number) =>
    new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(plan.total_remaining ? part / plan.total_remaining : 0);
  const parts = [
    { key: 'principal', label: t('installments.partPrincipal'), long: null, amount: b.principal, month: nb?.principal, series: seriesFor(plan, 0) },
    { key: 'interest', label: t('installments.partInterest'), long: null, amount: b.interest, month: nb?.interest, series: EXTRA_SERIES },
    { key: 'bsmv', label: t('installments.partBsmv'), long: t('installments.partBsmvLong'), amount: b.bsmv, month: nb?.bsmv, series: EXTRA_SERIES },
    { key: 'kkdf', label: t('installments.partKkdf'), long: t('installments.partKkdfLong'), amount: b.kkdf, month: nb?.kkdf, series: EXTRA_SERIES },
  ];

  return (
    <Card
      title={t('installments.cashTitle')}
      description={t('installments.cashCaption', { plan: plan.description, count: plan.remaining_count })}
    >
      <p className="max-w-measure text-body text-ink">
        <Rich
          i18nKey="installments.cashLead"
          values={{ count: plan.remaining_count, total: fmt(plan.total_remaining, c), principal: fmt(b.principal, c) }}
        />
      </p>
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <StackedBar
          label={parts.map((p) => `${p.label} ${fmt(p.amount, c)}`).join(', ')}
          parts={parts.map((p) => ({ key: p.key, value: p.amount, series: p.series, label: pct(p.amount) }))}
          aside={
            <>
              {t('installments.colRemaining')}: <Money minor={plan.total_remaining} currency={c} className="font-bold" />
            </>
          }
          caption={parts.map((p) => `${p.label} ${pct(p.amount)}`).join(', ')}
        />
        <Table caption={t('installments.cashTitle')} captionHidden className="-mx-6" scroll={false}>
          <THead>
            <Tr>
              <Th>{t('installments.colPart')}</Th>
              {next && nb ? <Th numeric>{t('installments.colMonthPart', { month: formatMonth(next.month, locale) })}</Th> : null}
              <Th numeric className="lg:pr-0">
                {t('installments.colRemaining')}
              </Th>
            </Tr>
          </THead>
          <TBody>
            {parts.map((p) => (
              <Tr key={p.key}>
                <Th scope="row" className="font-normal">
                  <span className="block font-semibold">{p.label}</span>
                  {p.long ? <span className="block text-meta text-muted">{p.long}</span> : null}
                </Th>
                {next && nb ? (
                  <Td numeric>
                    <Money minor={p.month ?? 0} currency={c} />
                  </Td>
                ) : null}
                <Td numeric className="font-semibold">
                  <Money minor={p.amount} currency={c} />
                </Td>
              </Tr>
            ))}
          </TBody>
          <TFoot>
            <Tr>
              <Th scope="row" className="font-bold">
                {t('installments.partTotal')}
              </Th>
              {next?.item && nb ? (
                <Td numeric className="font-bold">
                  <Money minor={next.item.amount} currency={c} />
                </Td>
              ) : null}
              <Td numeric className="font-bold">
                <Money minor={plan.total_remaining} currency={c} />
              </Td>
            </Tr>
          </TFoot>
        </Table>
      </div>
    </Card>
  );
}
