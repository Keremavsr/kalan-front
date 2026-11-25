import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForecast, useMonthlySummary, useProviders, useSchedule, useStatements } from '../../api/queries';
import type { Forecast, ForecastCard, Schedule } from '../../api/types';
import { PencilLink } from '../../components/pencil';
import { Button, Notice, PageHeader, QueryState, Rich, Section, buttonClass, useMoneyFormatter } from '../../components/ui';
import { formatDate, formatMonth, formatMonthName } from '../../lib/format';
import { monthOf } from '../../lib/month';
import { useIntlLocale } from '../../lib/useLocale';
import { useCategoryName } from '../spending/categoryName';
import { AlertsBody } from './Alerts';
import { FirstRun } from './FirstRun';
import { SuggestionsBody } from './Suggestions';

/**
 * Özet answers three questions, top to bottom: what do I pay now, card by card; how much installment debt is left
 * and when it ends; where does my money go and where can I save. Before the first statement it is the first-run flow.
 */
export function OverviewPage() {
  const { t } = useTranslation();
  const statements = useStatements();
  const forecast = useForecast(true);
  const items = statements.data?.items ?? [];

  if (statements.isSuccess && !items.length) {
    return (
      <>
        <PageHeader title={t('overview.title')}>
          <p>{t('overview.first.lead')}</p>
        </PageHeader>
        <FirstRun />
      </>
    );
  }

  return (
    <>
      <PageHeader title={t('overview.title')}>
        {forecast.data ? <Lead forecast={forecast.data} /> : null}
      </PageHeader>
      <QueryState query={statements}>
        {() => (
          <div className="grid gap-14">
            <AiInvite />
            <Section id="due" title={t('overview.due.title')}>
              <DueBody query={forecast} />
            </Section>
            <Section id="left" title={t('overview.left.title')}>
              <InstallmentsLeft />
            </Section>
            <Section id="todo" title={t('overview.todo.title')}>
              <AlertsBody limit={3} />
            </Section>
            <Section id="suggestions" title={t('overview.suggestions.title')}>
              <SuggestionsBody />
            </Section>
            <Section id="where" title={t('overview.where.title')}>
              <WhereMoneyGoes month={items[0] ? monthOf(items[0].period_end) : undefined} />
            </Section>
          </div>
        )}
      </QueryState>
    </>
  );
}

/** The page's first line is the answer to "what do I pay next": the total, ringed, and the nearest due date. */
function Lead({ forecast }: { forecast: Forecast }) {
  const fmt = useMoneyFormatter();
  const locale = useIntlLocale();
  const cards = forecast.cards ?? [];
  const first = cards[0];
  if (!first || forecast.total === undefined) return null;
  const c = forecast.currency ?? 'TRY';
  return (
    <p>
      <Rich
        i18nKey={cards.length > 1 ? 'overview.leadDue' : 'overview.leadDueOne'}
        values={{
          total: fmt(forecast.total, c),
          count: cards.length,
          card: first.card_label,
          date: formatDate(first.due_date, locale, 'long'),
          amount: fmt(first.amount, c),
        }}
      />
    </p>
  );
}

/** One line when no AI tool is chosen: what it would add, and the way to Settings. */
function AiInvite() {
  const { t } = useTranslation();
  const providers = useProviders();
  if (!providers.isSuccess || providers.data.selected) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-y border-line py-4">
      <p className="max-w-measure text-body text-ink">{t('overview.invite.text')}</p>
      <Link to="/settings" className={buttonClass('secondary', 'sm')}>
        {t('overview.invite.action')}
      </Link>
    </div>
  );
}

type ForecastQuery = ReturnType<typeof useForecast>;

/** "Ödeyeceklerin": one row per card, the nearest due first, then the total the back end added up. */
function DueBody({ query }: { query: ForecastQuery }) {
  const { t } = useTranslation();
  const fmt = useMoneyFormatter();
  if (query.isPending) return <p className="text-body text-muted" role="status">{t('common.loading')}</p>;
  if (query.isError)
    return (
      <Notice
        tone="warning"
        title={t('overview.due.loadError')}
        actions={
          <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
            {t('common.retry')}
          </Button>
        }
      />
    );
  const f = query.data;
  const cards = f.cards ?? [];
  const c = f.currency ?? 'TRY';
  if (!cards.length) return <p className="text-body text-ink">{t('overview.due.none')}</p>;

  return (
    <div className="grid gap-3">
      <table className="w-full border-t border-ink text-left">
        <caption className="sr-only">{t('overview.due.title')}</caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">{t('overview.due.colCard')}</th>
            <th scope="col">{t('overview.due.colDue')}</th>
            <th scope="col">{t('overview.due.colAmount')}</th>
          </tr>
        </thead>
        <tbody>
          {cards.map((card) => (
            <DueRow key={card.card_id} card={card} currency={c} />
          ))}
        </tbody>
        {f.total !== undefined && cards.length > 1 ? (
          <tfoot>
            <tr className="border-b border-ink">
              <th scope="row" colSpan={2} className="py-4 text-body font-bold text-ink">
                {t('overview.due.total')}
              </th>
              <td className="py-4 text-right text-lead font-bold whitespace-nowrap text-ink">{fmt(f.total, c)}</td>
            </tr>
          </tfoot>
        ) : null}
      </table>
      {f.fixed ? (
        <p className="text-meta text-muted">
          <Rich i18nKey="overview.due.fixed" values={{ amount: fmt(f.fixed, c) }} />
        </p>
      ) : null}
    </div>
  );
}

function DueRow({ card, currency }: { card: ForecastCard; currency: string }) {
  const { t } = useTranslation();
  const fmt = useMoneyFormatter();
  const locale = useIntlLocale();
  const days = card.days_left;
  const when = days < 0 ? t('overview.due.past') : days === 0 ? t('overview.due.today') : t('overview.due.days', { count: days });
  const next = card.next_statement;
  const parts = card.estimated && card.parts ? card.parts : null;

  return (
    <tr className="border-b border-line align-baseline">
      <th scope="row" className="py-5 pr-6 text-left font-normal">
        <span className="block text-lead leading-snug font-bold text-ink">{card.card_label}</span>
        <span className="mt-1 block max-w-measure text-meta text-muted">
          {card.estimated
            ? next
              ? t('overview.due.estimatedNote', { date: formatDate(next.cut_off, locale, 'long') })
              : t('overview.due.estimatedShort')
            : card.minimum_payment !== null
              ? t('overview.due.statementNote', { minimum: fmt(card.minimum_payment, currency) })
              : t('overview.due.statementShort')}
          {parts ? (
            <>
              {' '}
              {t('overview.due.parts', {
                installments: fmt(parts.installments, currency),
                subscriptions: fmt(parts.subscriptions, currency),
                other: fmt(parts.other, currency),
              })}
            </>
          ) : null}
        </span>
      </th>
      <td className="py-5 pr-6 text-body whitespace-nowrap text-ink">
        <span className="block font-semibold">{t('overview.due.dueOn', { date: formatDate(card.due_date, locale, 'long') })}</span>
        <span className="block text-meta text-muted">{when}</span>
      </td>
      <td className="py-5 text-right whitespace-nowrap">
        {card.estimated ? <span className="mr-2 text-meta font-semibold text-ink">{t('overview.due.estimated')}</span> : null}
        <span className="text-lead font-bold text-ink">{fmt(card.amount, currency)}</span>
      </td>
    </tr>
  );
}

/** "Kalan taksitlerin": the back end's summary in one sentence, then the next 12 months as labelled columns. */
function InstallmentsLeft() {
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
      />
    );
  return <LeftBody schedule={schedule.data} />;
}

function LeftBody({ schedule }: { schedule: Schedule }) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const fmt = useMoneyFormatter();
  const c = schedule.currency;
  const s = schedule.summary;
  const max = Math.max(1, ...schedule.months.map((m) => m.total));
  const sentence =
    s && s.plan_count > 0 ? (
      <Rich
        i18nKey="overview.left.sentence"
        count={s.plan_count}
        values={{ count: s.plan_count, amount: fmt(s.total_remaining, c), month: s.last_month ? formatMonth(s.last_month, locale) : '' }}
      />
    ) : (
      t('overview.left.none')
    );

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <p className="max-w-measure text-body text-ink">{sentence}</p>
        <PencilLink to="/installments" className="text-meta font-semibold">
          {t('overview.load.go')}
        </PencilLink>
      </div>
      {s && s.plan_count > 0 ? (
        <figure className="grid gap-1.5">
          <figcaption className="sr-only">{t('overview.left.chart')}</figcaption>
          <ol className="flex h-28 items-end gap-1 border-b border-ink">
            {schedule.months.map((m) => (
              <li key={m.month} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
                <span className="sr-only">
                  {formatMonth(m.month, locale)}: {fmt(m.total, c)}
                </span>
                {m.total ? (
                  <span aria-hidden className="mb-1 truncate text-meta font-semibold text-ink">
                    {fmt(m.total, c, { bare: true })}
                  </span>
                ) : null}
                <span
                  aria-hidden
                  className={m.total ? 'bar-y w-full rounded-t-bar bg-series-ink' : 'w-full'}
                  style={{ height: `${(m.total / max) * 60}%` }}
                />
              </li>
            ))}
          </ol>
          <div aria-hidden className="flex gap-1">
            {schedule.months.map((m) => (
              <span key={m.month} className="min-w-0 flex-1 truncate text-center text-meta text-muted">
                {formatMonthName(m.month, locale)}
              </span>
            ))}
          </div>
        </figure>
      ) : null}
    </div>
  );
}

/** "Paran nereye gidiyor": the latest month's five biggest categories as flat bars, in the back end's order. */
function WhereMoneyGoes({ month }: { month: string | undefined }) {
  const { t } = useTranslation();
  const summary = useMonthlySummary(month);
  const fmt = useMoneyFormatter();
  const locale = useIntlLocale();
  const name = useCategoryName();
  if (!month) return null;
  if (summary.isPending) return <p className="text-body text-muted" role="status">{t('common.loading')}</p>;
  if (summary.isError)
    return (
      <Notice
        tone="warning"
        title={t('overview.where.loadError')}
        actions={
          <Button variant="secondary" size="sm" onClick={() => void summary.refetch()}>
            {t('common.retry')}
          </Button>
        }
      />
    );
  const data = summary.data;
  const top = data.by_category.slice(0, 5);
  if (!top.length) return <p className="text-body text-ink">{t('overview.where.none')}</p>;
  const max = Math.max(1, ...top.map((x) => x.amount));
  const c = data.currency;
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <p className="max-w-measure text-body text-ink">
          <Rich
            i18nKey="overview.where.sentence"
            values={{ month: formatMonth(data.month, locale), total: fmt(data.total_spend, c), top: name(top[0]!.category), amount: fmt(top[0]!.amount, c) }}
          />
        </p>
        <Link to={`/spending/${data.month}`} className={buttonClass('ghost', 'sm', 'gap-1.5')}>
          {t('overview.where.go')}
          <ArrowRight aria-hidden className="size-3.5" />
        </Link>
      </div>
      <ul className="grid gap-3" aria-label={t('overview.where.title')}>
        {top.map((x) => (
          <li key={x.category} className="grid grid-cols-[11rem_minmax(0,1fr)_8rem] items-center gap-4">
            <span className="truncate text-body font-semibold text-ink">{name(x.category)}</span>
            <span aria-hidden className="h-6 min-w-0">
              <span className="bar-x block h-full rounded-bar bg-series-ink" style={{ width: `${(x.amount / max) * 100}%` }} />
            </span>
            <span className="text-right text-body whitespace-nowrap text-ink">{fmt(x.amount, c)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
