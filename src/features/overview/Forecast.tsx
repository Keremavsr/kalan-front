import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForecastBacktest } from '../../api/queries';
import type { BacktestSummary, Forecast, ForecastPartsMap } from '../../api/types';
import {
  Money,
  Notice,
  QueryState,
  Rich,
  Segmented,
  StackedBar,
  Swatch,
  Table,
  TBody,
  THead,
  Td,
  Th,
  Tr,
  useMoneyFormatter,
} from '../../components/ui';
import { formatDate, formatMonth, formatPercent } from '../../lib/format';
import type { Series } from '../../lib/series';
import { TextButton } from '../../components/ui/TextButton';
import { useIntlLocale } from '../../lib/useLocale';

type PartKey = 'installments' | 'subscriptions' | 'variable' | 'fixed';

/** Certain first, guessed last: installments in ink, then the pigments. */
const PART_SERIES: Record<PartKey, Series> = { installments: 'ink', subscriptions: 'prusya', variable: 'asi', fixed: 'toprak' };

export type FixedChoice = 'yes' | 'no';

/**
 * The next statement, part by part, exactly as the back end splits it. Fixed costs may not be paid
 * by card, so the user decides whether they count; the back end recomputes the total.
 */
export function ForecastBody({
  data,
  includeFixed,
  onIncludeFixed,
}: {
  data: Forecast;
  includeFixed: FixedChoice;
  onIncludeFixed: (v: FixedChoice) => void;
}) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const fmt = useMoneyFormatter();
  const f = data.forecast!;
  const c = f.currency;
  const p = f.parts;
  const basis = f.variable_basis.months;
  const fixedCounts = f.include_fixed;

  const variableNote =
    basis.length > 1
      ? t('overview.forecast.variableNote', { from: formatMonth(basis[0]!, locale, 'short'), to: formatMonth(basis.at(-1)!, locale, 'short') })
      : basis.length === 1
        ? t('overview.forecast.variableNoteOne', { month: formatMonth(basis[0]!, locale, 'short') })
        : t('overview.forecast.variableNoteNone');

  const rows: PartRow[] = [
    { key: 'installments', note: t('overview.forecast.installmentsNote'), counted: true },
    {
      key: 'subscriptions',
      note: f.subscriptions.length
        ? t('overview.forecast.subscriptionsNote', { names: f.subscriptions.map((s) => s.merchant).join(', ') })
        : t('overview.forecast.subscriptionsNone'),
      counted: true,
    },
    {
      key: 'variable',
      note: variableNote,
      extra: f.variable_basis.known_in_month ? t('overview.forecast.variableKnown', { amount: fmt(f.variable_basis.known_in_month, c) }) : null,
      counted: true,
    },
    { key: 'fixed', note: fixedCounts ? t('overview.forecast.fixedNote') : t('overview.forecast.fixedExcluded'), counted: fixedCounts },
  ];
  const inBar = rows.filter((r) => r.counted && p[r.key] > 0);
  const share = (v: number) => formatPercent(f.total ? v / f.total : 0, locale);

  return (
    <div className="grid gap-8">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <div className="grid gap-6">
          <StackedBar
            label={inBar.map((r) => `${t(`overview.forecast.${r.key}`)} ${fmt(p[r.key], c)}`).join(', ')}
            heading={formatMonth(f.month, locale)}
            aside={
              <>
                {t('overview.forecast.total')}: <Money minor={f.total} currency={c} className="font-bold" />
              </>
            }
            parts={inBar.map((r) => ({ key: r.key, value: p[r.key], series: PART_SERIES[r.key], label: share(p[r.key]) }))}
            caption={inBar.map((r) => `${t(`overview.forecast.${r.key}`)} ${share(p[r.key])}`).join(', ')}
          />
          <Segmented<FixedChoice>
            label={t('overview.forecast.includeFixed')}
            value={includeFixed}
            onChange={onIncludeFixed}
            options={[
              { value: 'yes', label: t('overview.forecast.includeFixedYes') },
              { value: 'no', label: t('overview.forecast.includeFixedNo') },
            ]}
          />
        </div>
        <PartsLabel rows={rows} parts={p} currency={c} />
      </div>
      <div className="grid max-w-measure gap-2 text-meta text-ink">
        {data.open_period.from ? (
          <p>
            {data.open_period.transactions.length ? (
              <Rich
                i18nKey="overview.forecast.openPeriod"
                values={{ from: formatDate(data.open_period.from, locale), amount: fmt(data.open_period.debit_total, c) }}
              />
            ) : (
              t('overview.forecast.openPeriodNone', { from: formatDate(data.open_period.from, locale) })
            )}
          </p>
        ) : null}
        <BacktestLine summary={data.backtest} />
      </div>
    </div>
  );
}

/** One small, honest line on how far the method missed in the past, with the months behind it on request. */
function BacktestLine({ summary }: { summary: BacktestSummary }) {
  const { t } = useTranslation();
  const fmt = useMoneyFormatter();
  const locale = useIntlLocale();
  const [open, setOpen] = useState(false);

  if (!summary.count || summary.mae === null) {
    return <p>{t('overview.forecast.backtestNone', { need: summary.min_history + 1 })}</p>;
  }
  const mape = summary.mape === null ? null : new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Number(summary.mape) * 100);
  const direction = !summary.bias ? null : summary.bias < 0 ? t('overview.forecast.backtestLow') : t('overview.forecast.backtestHigh');
  const values = { count: summary.count, mae: fmt(summary.mae, summary.currency), mape: mape ?? '', direction: direction ?? '' };
  const key = !direction ? 'backtestEven' : mape === null ? 'backtestNoPct' : 'backtest';

  return (
    <div>
      <p>
        <Rich i18nKey={`overview.forecast.${key}`} values={values} />{' '}
        <TextButton onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {t('overview.forecast.backtestOpen')}
        </TextButton>
      </p>
      {open ? <BacktestMonths /> : null}
    </div>
  );
}

function BacktestMonths() {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const backtest = useForecastBacktest({});
  return (
    <div className="enter mt-3">
      <p className="mb-2 text-muted">{t('overview.forecast.backtestCaption')}</p>
      <QueryState query={backtest}>
        {() =>
          backtest.data && backtest.data.months.length ? (
            <Table caption={t('overview.forecast.backtestCaption')} captionHidden className="-mx-6 max-w-2xl">
              <THead>
                <Tr>
                  <Th>{t('overview.forecast.colMonth')}</Th>
                  <Th numeric>{t('overview.forecast.colForecast')}</Th>
                  <Th numeric>{t('overview.forecast.colActual')}</Th>
                  <Th numeric>{t('overview.forecast.colError')}</Th>
                </Tr>
              </THead>
              <TBody>
                {backtest.data.months.map((m) => (
                  <Tr key={m.month}>
                    <Th scope="row" className="font-normal">
                      {formatMonth(m.month, locale)}
                    </Th>
                    <Td numeric>
                      <Money minor={m.forecast} currency={backtest.data.currency} />
                    </Td>
                    <Td numeric>
                      <Money minor={m.actual} currency={backtest.data.currency} />
                    </Td>
                    <Td numeric>
                      <Money minor={m.error} currency={backtest.data.currency} signDisplay="exceptZero" />
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          ) : (
            <Notice>{t('overview.forecast.backtestNone', { need: (backtest.data?.min_history ?? 2) + 1 })}</Notice>
          )
        }
      </QueryState>
    </div>
  );
}

interface PartRow {
  key: PartKey;
  note: string;
  extra?: string | null;
  counted: boolean;
}

/** The parts as a museum label: a heavy rule, then one hairline row per part with its source in small type. */
function PartsLabel({ rows, parts, currency }: { rows: PartRow[]; parts: ForecastPartsMap; currency: string }) {
  const { t } = useTranslation();
  return (
    <dl className="border-t-2 border-ink text-meta text-ink">
      {rows.map((r) => (
        <div key={r.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 border-b border-line py-2.5">
          <dt className="flex min-w-0 items-start gap-2.5">
            <Swatch series={PART_SERIES[r.key]} className={r.counted ? 'mt-1' : 'mt-1 opacity-40'} />
            <span className="min-w-0">
              <span className="block font-semibold">{t(`overview.forecast.${r.key}`)}</span>
              <span className="block text-muted">{r.note}</span>
              {r.extra ? <span className="block text-muted">{r.extra}</span> : null}
            </span>
          </dt>
          <dd className={r.counted ? 'font-semibold' : 'text-muted line-through'}>
            <Money minor={parts[r.key]} currency={currency} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
