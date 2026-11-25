import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useQueries } from '@tanstack/react-query';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useApi } from '../../api/context';
import { keys, useMonthlySummary, useStatements } from '../../api/queries';
import { TRANSACTION_KINDS, type MonthlySummary, type Statement, type Transaction } from '../../api/types';
import {
  Button,
  Card,
  Money,
  Notice,
  PageHeader,
  QueryState,
  Rich,
  SelectField,
  Table,
  TBody,
  THead,
  Td,
  TextField,
  Th,
  Tr,
  buttonClass,
  useMoneyFormatter,
} from '../../components/ui';
import { foldForSearch, formatDate, formatDayMonth, formatMonth, formatPercent } from '../../lib/format';
import { monthOf } from '../../lib/month';
import { useIntlLocale } from '../../lib/useLocale';
import { cx } from '../../lib/cx';
import { ManualEntryModal } from '../manual/ManualEntryModal';

export function MonthPage() {
  const { t } = useTranslation();
  const { month } = useParams();
  const statements = useStatements();
  const months = useMemo(
    () => [...new Set((statements.data?.items ?? []).map((s) => monthOf(s.period_end)))].sort(),
    [statements.data],
  );

  if (!month) {
    if (statements.isPending || statements.isError) {
      return (
        <>
          <PageHeader title={t('month.title')} />
          <QueryState query={statements}>{() => null}</QueryState>
        </>
      );
    }
    const latest = months.at(-1);
    if (!latest) {
      return (
        <>
          <PageHeader title={t('month.title')} />
          <Notice
            title={t('month.noStatements')}
            actions={
              <Link to="/upload" className={buttonClass('secondary', 'sm')}>
                {t('month.goUpload')}
              </Link>
            }
          />
        </>
      );
    }
    return <Navigate to={`/month/${latest}`} replace />;
  }
  return <MonthView month={month} months={months} />;
}

function MonthView({ month, months }: { month: string; months: string[] }) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const navigate = useNavigate();
  const summary = useMonthlySummary(month);
  const [manualOpen, setManualOpen] = useState(false);
  const position = months.indexOf(month);
  const prev = position > 0 ? months[position - 1] : undefined;
  const next = position >= 0 && position < months.length - 1 ? months[position + 1] : undefined;

  return (
    <>
      <PageHeader
        title={`${t('month.title')}: ${formatMonth(month, locale)}`}
        actions={
          <>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                aria-label={t('month.prev')}
                disabled={!prev}
                onClick={() => prev && void navigate(`/month/${prev}`)}
                icon={<ChevronLeft aria-hidden className="size-4" />}
              />
              <SelectField
                label={t('month.picker')}
                fieldClassName="[&>label]:sr-only"
                className="h-8 w-44"
                value={month}
                onChange={(e) => void navigate(`/month/${e.target.value}`)}
                options={(months.includes(month) ? months : [...months, month]).map((m) => ({
                  value: m,
                  label: formatMonth(m, locale),
                }))}
              />
              <Button
                size="sm"
                aria-label={t('month.next')}
                disabled={!next}
                onClick={() => next && void navigate(`/month/${next}`)}
                icon={<ChevronRight aria-hidden className="size-4" />}
              />
            </div>
            <Button variant="primary" icon={<Plus aria-hidden className="size-4" />} onClick={() => setManualOpen(true)}>
              {t('month.add')}
            </Button>
          </>
        }
      >
        {summary.data && summary.data.statement_ids.length ? <MonthLead summary={summary.data} /> : null}
      </PageHeader>

      <QueryState query={summary}>
        {() =>
          summary.data && summary.data.statement_ids.length ? (
            <MonthBody summary={summary.data} />
          ) : (
            <Notice title={t('month.empty')} />
          )
        }
      </QueryState>
      <ManualEntryModal open={manualOpen} onClose={() => setManualOpen(false)} />
    </>
  );
}

function MonthLead({ summary }: { summary: MonthlySummary }) {
  const fmt = useMoneyFormatter();
  const locale = useIntlLocale();
  const c = summary.currency;
  return (
    <p>
      <Rich i18nKey="month.lead" values={{ month: formatMonth(summary.month, locale), amount: fmt(summary.total_spend, c) }} />{' '}
      {summary.previous_month ? (
        <Rich
          i18nKey="month.leadChange"
          values={{
            previous: fmt(summary.previous_month.total_spend, c),
            percent: formatPercent(summary.previous_month.change, locale, { signDisplay: 'exceptZero' }),
          }}
        />
      ) : (
        <Rich i18nKey="month.leadNoPrevious" values={{}} />
      )}
      {summary.total_credit ? (
        <>
          {' '}
          <Rich i18nKey="month.leadCredit" values={{ amount: fmt(summary.total_credit, c) }} />
        </>
      ) : null}
    </p>
  );
}

function MonthBody({ summary }: { summary: MonthlySummary }) {
  const api = useApi();
  const statementQueries = useQueries({
    queries: summary.statement_ids.map((id) => ({ queryKey: keys.statement(id), queryFn: () => api.getStatement(id) })),
  });
  const loaded = statementQueries.map((q) => q.data).filter((s): s is Statement => Boolean(s));

  return (
    <div className="space-y-8">
      <PeriodLine statements={loaded} />
      <CategoryTable summary={summary} />
      {statementQueries.some((q) => q.isPending) ? null : (
        <TransactionsTable transactions={loaded.flatMap((s) => s.transactions)} />
      )}
    </div>
  );
}

function PeriodLine({ statements }: { statements: Statement[] }) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  if (!statements.length) return null;
  return (
    <div className="-mt-4 space-y-1 text-sm text-ink-muted">
      {statements.map((s) => (
        <p key={s.id}>
          {t('month.period', {
            start: formatDate(s.period_start, locale),
            end: formatDate(s.period_end, locale),
            due: formatDate(s.due_date, locale),
          })}
        </p>
      ))}
    </div>
  );
}

function CategoryTable({ summary }: { summary: MonthlySummary }) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const max = Math.max(1, ...summary.by_category.map((c) => c.amount));
  return (
    <Card title={t('month.byCategory')} flush>
      <Table caption={t('month.byCategory')} captionHidden>
        <THead>
          <Tr>
            <Th>{t('month.colCategory')}</Th>
            <Th className="w-1/2">
              <span className="sr-only">{t('month.colShare')}</span>
            </Th>
            <Th numeric>{t('month.colShare')}</Th>
            <Th numeric>{t('month.colAmount')}</Th>
          </Tr>
        </THead>
        <TBody>
          {summary.by_category.map((c) => (
            <Tr key={c.category}>
              <Th scope="row" className="text-sm font-normal text-ink">
                {t(`category.${c.category}`, { defaultValue: c.category })}
              </Th>
              <Td className="align-middle">
                <div className="h-2 w-full rounded-full bg-track" aria-hidden>
                  <div className="bar-grow h-full rounded-full bg-series-1" style={{ width: `${(c.amount / max) * 100}%` }} />
                </div>
              </Td>
              <Td numeric className="text-ink-muted">
                {formatPercent(c.share, locale)}
              </Td>
              <Td numeric>
                <Money minor={c.amount} currency={summary.currency} />
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}

function TransactionsTable({ transactions }: { transactions: Transaction[] }) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const [params, setParams] = useSearchParams();
  const highlight = params.get('tx');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [kind, setKind] = useState('');
  const highlightRef = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    highlightRef.current?.scrollIntoView({ block: 'center' });
  }, [highlight]);

  const categories = [...new Set(transactions.map((tx) => tx.category).filter((c): c is string => Boolean(c)))].sort();
  const kinds = TRANSACTION_KINDS.filter((k) => transactions.some((tx) => tx.kind === k));

  const needle = foldForSearch(query.trim(), locale);
  const shown = transactions.filter(
    (tx) =>
      (!needle ||
        foldForSearch(tx.description, locale).includes(needle) ||
        foldForSearch(tx.merchant ?? '', locale).includes(needle)) &&
      (!category || tx.category === category) &&
      (!kind || tx.kind === kind),
  );
  const filtered = Boolean(needle || category || kind);

  function clear() {
    setQuery('');
    setCategory('');
    setKind('');
    if (highlight) setParams({}, { replace: true });
  }

  return (
    <Card title={t('month.transactions')} flush>
      <div className="flex flex-wrap items-end gap-3 px-5 pb-4">
        <TextField
          label={t('month.search')}
          type="search"
          placeholder={t('month.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          fieldClassName="w-64"
        />
        <SelectField
          label={t('month.filterCategory')}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          fieldClassName="w-48"
          options={[
            { value: '', label: t('month.all') },
            ...categories.map((c) => ({ value: c, label: t(`category.${c}`, { defaultValue: c }) })),
          ]}
        />
        <SelectField
          label={t('month.filterKind')}
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          fieldClassName="w-44"
          options={[{ value: '', label: t('month.all') }, ...kinds.map((k) => ({ value: k, label: t(`kind.${k}`) }))]}
        />
        <p className="ml-auto pb-2.5 text-sm text-ink-muted" aria-live="polite">
          {t('month.showing', { shown: shown.length, total: transactions.length })}
        </p>
        {filtered ? (
          <Button variant="ghost" size="sm" className="mb-1" onClick={clear}>
            {t('month.clearFilters')}
          </Button>
        ) : null}
      </div>
      {shown.length ? (
        <Table caption={t('month.transactions')} captionHidden>
          <THead>
            <Tr>
              <Th className="w-24">{t('month.colDate')}</Th>
              <Th>{t('month.colDescription')}</Th>
              <Th>{t('month.colKind')}</Th>
              <Th>{t('month.colCategory')}</Th>
              <Th numeric>{t('month.colAmount')}</Th>
            </Tr>
          </THead>
          <TBody>
            {shown.map((tx) => {
              const isHighlighted = tx.id === highlight;
              return (
                <Tr
                  key={tx.id}
                  ref={isHighlighted ? highlightRef : undefined}
                  className={cx(
                    'transition-colors duration-(--duration-fast)',
                    isHighlighted ? 'bg-sunken shadow-mark' : 'hover:bg-sunken',
                  )}
                  aria-current={isHighlighted ? 'true' : undefined}
                >
                  <Td className="font-mono text-xs whitespace-nowrap text-ink-muted tabular">
                    <time dateTime={tx.date}>{formatDayMonth(tx.date, locale)}</time>
                  </Td>
                  <Td>
                    <span className="block">{tx.description}</span>
                    {tx.installment || tx.source === 'manual' || isHighlighted ? (
                      <span className="block text-xs text-ink-muted">
                        {[
                          tx.installment ? t('common.left', { count: tx.installment.remaining_count }) : null,
                          tx.source === 'manual' ? t('common.manual') : null,
                          isHighlighted ? t('month.highlighted') : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    ) : null}
                  </Td>
                  <Td className="text-ink-muted">{t(`kind.${tx.kind}`)}</Td>
                  <Td className="text-ink-muted">
                    {tx.category ? t(`category.${tx.category}`, { defaultValue: tx.category }) : t('category.none')}
                  </Td>
                  <Td numeric className={tx.direction === 'credit' ? 'text-positive' : undefined}>
                    <Money
                      minor={tx.direction === 'credit' ? -tx.amount : tx.amount}
                      currency={tx.currency}
                    />
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      ) : (
        <div className="px-5 pb-5">
          <Notice title={t('month.noResults')} />
        </div>
      )}
    </Card>
  );
}
