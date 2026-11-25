import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, PencilLine } from 'lucide-react';
import { useQueries } from '@tanstack/react-query';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useApi } from '../../api/context';
import { keys, useMonthlySummary, useStatements, useTransactions } from '../../api/queries';
import { TRANSACTION_KINDS, type MonthlySummary, type Statement, type Transaction, type TransactionSource } from '../../api/types';
import {
  Button,
  Card,
  EmptyState,
  KeyValue,
  Money,
  PageHeader,
  QueryState,
  Rich,
  SelectField,
  StackedBar,
  Swatch,
  Table,
  TBody,
  THead,
  Td,
  TextField,
  Th,
  Tr,
  buttonClass,
  useMoneyFormatter,
  type BarPart,
} from '../../components/ui';
import { foldForSearch, formatDate, formatDayMonth, formatMonth, formatPercent } from '../../lib/format';
import { monthOf } from '../../lib/month';
import { useIntlLocale } from '../../lib/useLocale';
import { cx } from '../../lib/cx';
import { seriesAt, type Series } from '../../lib/series';
import { Scribble } from '../../components/pencil';
import { SectionState } from '../../components/ui/SectionState';
import { CategoryRuleModal } from './CategoryRuleModal';
import { CategoryRules } from './CategoryRules';
import { useCategoryName } from './categoryName';

const SOURCES: TransactionSource[] = ['statement', 'manual', 'import'];

export function SpendingPage() {
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
          <PageHeader title={t('spending.title')} />
          <QueryState query={statements}>{() => null}</QueryState>
        </>
      );
    }
    const latest = months.at(-1);
    if (!latest) {
      return (
        <>
          <PageHeader title={t('spending.title')} />
          <EmptyState
            mark="empty"
            title={t('spending.noStatementsTitle')}
            action={
              <Link to="/statements" className={buttonClass('secondary')}>
                {t('spending.goUpload')}
              </Link>
            }
          >
            {t('spending.noStatements')}
          </EmptyState>
        </>
      );
    }
    return <Navigate to={`/spending/${latest}`} replace />;
  }
  return <MonthView month={month} months={months} />;
}

function MonthView({ month, months }: { month: string; months: string[] }) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const navigate = useNavigate();
  const summary = useMonthlySummary(month);
  const position = months.indexOf(month);
  const prev = position > 0 ? months[position - 1] : undefined;
  const next = position >= 0 && position < months.length - 1 ? months[position + 1] : undefined;

  return (
    <>
      <PageHeader
        title={t('spending.title')}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="icon"
              aria-label={t('spending.prev')}
              disabled={!prev}
              onClick={() => prev && void navigate(`/spending/${prev}`)}
              icon={<ChevronLeft aria-hidden className="size-4" />}
            />
            <SelectField
              label={t('spending.picker')}
              labelHidden
              fieldClassName="w-48"
              className="font-semibold"
              value={month}
              onChange={(e) => void navigate(`/spending/${e.target.value}`)}
              options={(months.includes(month) ? months : [...months, month]).map((m) => ({
                value: m,
                label: formatMonth(m, locale),
              }))}
            />
            <Button
              variant="icon"
              aria-label={t('spending.next')}
              disabled={!next}
              onClick={() => next && void navigate(`/spending/${next}`)}
              icon={<ChevronRight aria-hidden className="size-4" />}
            />
          </div>
        }
      >
        {summary.data && hasData(summary.data) ? <MonthLead summary={summary.data} /> : null}
      </PageHeader>

      <QueryState query={summary}>
        {() =>
          summary.data && hasData(summary.data) ? (
            <MonthBody summary={summary.data} />
          ) : (
            <EmptyState mark="empty" title={t('spending.emptyTitle')}>
              {t('spending.empty')}
            </EmptyState>
          )
        }
      </QueryState>
    </>
  );
}

/** A month counts when a statement ends in it or manual and imported rows fall in it. */
function hasData(summary: MonthlySummary) {
  return summary.statement_ids.length > 0 || summary.by_category.length > 0 || summary.total_credit > 0;
}

function MonthLead({ summary }: { summary: MonthlySummary }) {
  const fmt = useMoneyFormatter();
  const locale = useIntlLocale();
  const c = summary.currency;
  return (
    <p>
      <Rich i18nKey="spending.lead" values={{ month: formatMonth(summary.month, locale), amount: fmt(summary.total_spend, c) }} />{' '}
      {summary.previous_month ? (
        <Rich
          i18nKey="spending.leadChange"
          values={{
            previous: fmt(summary.previous_month.total_spend, c),
            percent: formatPercent(summary.previous_month.change, locale, { signDisplay: 'exceptZero' }),
          }}
        />
      ) : (
        <Rich i18nKey="spending.leadNoPrevious" values={{}} />
      )}
      {summary.total_credit ? (
        <>
          {' '}
          <Rich i18nKey="spending.leadCredit" values={{ amount: fmt(summary.total_credit, c) }} />
        </>
      ) : null}
    </p>
  );
}

function MonthBody({ summary }: { summary: MonthlySummary }) {
  const { t } = useTranslation();
  const api = useApi();
  const statementQueries = useQueries({
    queries: summary.statement_ids.map((id) => ({ queryKey: keys.statement(id), queryFn: () => api.getStatement(id) })),
  });
  const loaded = statementQueries.map((q) => q.data).filter((s): s is Statement => Boolean(s));
  // Every row of the statement month, whatever its source: statement rows by their statement's period end,
  // manual and imported rows by their own date (GET /transactions?month=).
  const transactions = useTransactions({ month: summary.month });

  return (
    <div className="grid grid-cols-1 gap-8">
      <CategoryCard summary={summary} statements={loaded} />
      <SectionState query={transactions} failed={t('spending.transactionsFailed')}>
        {() => <TransactionsTable transactions={transactions.data?.items ?? []} />}
      </SectionState>
      <CategoryRules />
    </div>
  );
}

/** Top five categories take a pigment each; the rest share the grey slice. */
const TOP = 5;

function CategoryCard({ summary, statements }: { summary: MonthlySummary; statements: Statement[] }) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const fmt = useMoneyFormatter();
  const c = summary.currency;
  const sorted = [...summary.by_category].sort((a, b) => b.amount - a.amount);
  const seriesOf = new Map<string, Series>(sorted.map((cat, i) => [cat.category, i < TOP ? seriesAt(i) : 'gri']));
  const name = useCategoryName();
  const rest = sorted.slice(TOP);
  const parts: BarPart[] = sorted.slice(0, TOP).map((cat) => ({
    key: cat.category,
    value: cat.amount,
    series: seriesOf.get(cat.category)!,
    label: formatPercent(cat.share, locale),
  }));
  if (rest.length) {
    const amount = rest.reduce((sum, cat) => sum + cat.amount, 0);
    const share = rest.reduce((sum, cat) => sum + Number(cat.share), 0);
    parts.push({ key: 'rest', value: amount, series: 'gri', label: formatPercent(share.toFixed(4), locale) });
  }

  return (
    <Card title={t('spending.byCategory')}>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
        <div className="grid min-w-0 gap-6">
          <StackedBar
            label={t('spending.categoryBar', {
              parts: sorted.map((cat) => `${name(cat.category)} ${fmt(cat.amount, c)}`).join(', '),
            })}
            parts={parts}
            caption={[
              ...sorted.slice(0, TOP).map((cat) => `${name(cat.category)} ${formatPercent(cat.share, locale)}`),
              ...(rest.length ? [`${t('spending.others')}: ${rest.map((cat) => name(cat.category)).join(', ')}`] : []),
            ].join(', ')}
          />
          <Table caption={t('spending.byCategory')} captionHidden className="-mx-6">
            <THead>
              <Tr>
                <Th>{t('spending.colCategory')}</Th>
                <Th numeric>{t('spending.colShare')}</Th>
                <Th numeric>{t('spending.colAmount')}</Th>
              </Tr>
            </THead>
            <TBody>
              {sorted.map((cat) => (
                <Tr key={cat.category}>
                  <Th scope="row" className="font-normal">
                    <span className="inline-flex items-center gap-2.5">
                      <Swatch series={seriesOf.get(cat.category)!} />
                      {name(cat.category)}
                    </span>
                  </Th>
                  <Td numeric className="text-muted">
                    {formatPercent(cat.share, locale)}
                  </Td>
                  <Td numeric>
                    <Money minor={cat.amount} currency={c} />
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </div>
        <div className="grid grid-cols-1 gap-6">
          {statements.map((st) => (
            <KeyValue
              key={st.id}
              items={[
                {
                  k: 'D',
                  label: t('spending.period'),
                  // Each date stays on one line; a narrow column breaks only after the dash.
                  value: (
                    <>
                      <span className="whitespace-nowrap">{formatDate(st.period_start, locale)} –</span>{' '}
                      <span className="whitespace-nowrap">{formatDate(st.period_end, locale)}</span>
                    </>
                  ),
                },
                { k: 'S', label: t('spending.due'), value: formatDate(st.due_date, locale) },
                { k: 'K', label: t('statements.card'), value: `•••• ${st.card_last4}` },
              ]}
            />
          ))}
        </div>
      </div>
    </Card>
  );
}

function TransactionsTable({ transactions }: { transactions: Transaction[] }) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const name = useCategoryName();
  const [params, setParams] = useSearchParams();
  const highlight = params.get('tx');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [kind, setKind] = useState('');
  const [source, setSource] = useState('');
  const [editing, setEditing] = useState<Transaction | null>(null);
  const highlightRef = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    highlightRef.current?.scrollIntoView({ block: 'center' });
  }, [highlight]);

  const categories = [...new Set(transactions.map((tx) => tx.category).filter((c): c is string => Boolean(c)))].sort();
  const kinds = TRANSACTION_KINDS.filter((k) => transactions.some((tx) => tx.kind === k));
  const sources = SOURCES.filter((k) => transactions.some((tx) => tx.source === k));

  const needle = foldForSearch(query.trim(), locale);
  const shown = transactions.filter(
    (tx) =>
      (!needle ||
        foldForSearch(tx.description, locale).includes(needle) ||
        foldForSearch(tx.merchant ?? '', locale).includes(needle)) &&
      (!category || tx.category === category) &&
      (!kind || tx.kind === kind) &&
      (!source || tx.source === source),
  );
  const filtered = Boolean(needle || category || kind || source);

  function clear() {
    setQuery('');
    setCategory('');
    setKind('');
    setSource('');
    if (highlight) setParams({}, { replace: true });
  }

  return (
    <Card title={t('spending.transactions')} description={t('spending.categoryHint')} flush>
      <div className="flex flex-wrap items-end gap-3 px-6 pt-5 pb-4">
        <TextField
          label={t('spending.search')}
          type="search"
          placeholder={t('spending.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          fieldClassName="w-60"
        />
        <SelectField
          label={t('spending.filterCategory')}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          fieldClassName="w-44"
          options={[{ value: '', label: t('spending.all') }, ...categories.map((c) => ({ value: c, label: name(c) }))]}
        />
        <SelectField
          label={t('spending.filterKind')}
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          fieldClassName="w-40"
          options={[{ value: '', label: t('spending.all') }, ...kinds.map((k) => ({ value: k, label: t(`kind.${k}`) }))]}
        />
        <SelectField
          label={t('spending.filterSource')}
          value={source}
          onChange={(e) => setSource(e.target.value)}
          fieldClassName="w-40"
          options={[
            { value: '', label: t('spending.all') },
            ...sources.map((k) => ({ value: k, label: t(`spending.source.${k}`) })),
          ]}
        />
        <p className="ml-auto pb-3 text-meta text-ink" aria-live="polite">
          {t('spending.showing', { shown: shown.length, total: transactions.length })}
        </p>
        {filtered ? (
          <Button variant="ghost" size="sm" className="mb-1" onClick={clear}>
            {t('spending.clearFilters')}
          </Button>
        ) : null}
      </div>
      {shown.length ? (
        <Table caption={t('spending.transactions')} captionHidden>
          <THead>
            <Tr>
              <Th className="w-24">{t('spending.colDate')}</Th>
              <Th>{t('spending.colDescription')}</Th>
              <Th>{t('spending.colKind')}</Th>
              <Th>{t('spending.colCategory')}</Th>
              <Th numeric>{t('spending.colAmount')}</Th>
            </Tr>
          </THead>
          <TBody>
            {shown.map((tx) => {
              const isHighlighted = tx.id === highlight;
              const notes = [
                tx.installment ? t('common.left', { count: tx.installment.remaining_count }) : null,
                tx.source === 'manual' ? t('common.manual') : null,
                tx.source === 'import' ? t('spending.source.importedRow') : null,
                isHighlighted ? t('spending.highlighted') : null,
              ].filter(Boolean);
              return (
                <Tr
                  key={tx.id}
                  ref={isHighlighted ? highlightRef : undefined}
                  className={cx(
                    'group transition-colors duration-(--duration-fast)',
                    isHighlighted ? 'bg-ground-alt' : 'hover:bg-ground',
                  )}
                  aria-current={isHighlighted ? 'true' : undefined}
                >
                  <Td className="text-meta whitespace-nowrap text-ink">
                    <time dateTime={tx.date}>{formatDayMonth(tx.date, locale)}</time>
                  </Td>
                  <Td>
                    {isHighlighted ? (
                      <span className="scribble-host relative font-semibold" data-marked="true">
                        {tx.description}
                        <Scribble seed={tx.id} />
                      </span>
                    ) : (
                      <span className="block font-semibold">{tx.description}</span>
                    )}
                    {notes.length ? <span className="block text-meta text-muted">{notes.join(' · ')}</span> : null}
                  </Td>
                  <Td className="text-muted">{t(`kind.${tx.kind}`)}</Td>
                  <Td className="text-muted">
                    {/* Rules match merchant names on statement and imported rows; a manual row, or a row with no
                        merchant (carried balance, payment, fee lines), has nothing a rule could follow. */}
                    {tx.source === 'manual' || !tx.merchant ? (
                      name(tx.category)
                    ) : (
                      <button
                        type="button"
                        className={cx(
                          'inline-flex items-center gap-1.5 text-left underline decoration-line decoration-1 underline-offset-4',
                          'transition-colors duration-(--duration-1) ease-(--ease-out) hover:text-ink hover:decoration-ink focus-visible:text-ink',
                        )}
                        onClick={() => setEditing(tx)}
                        aria-label={t('spending.changeCategoryFor', { category: name(tx.category), merchant: tx.merchant ?? tx.description })}
                      >
                        <span>{name(tx.category)}</span>
                        <PencilLine aria-hidden className="size-3.5 shrink-0 opacity-0 transition-opacity duration-(--duration-1) ease-(--ease-out) group-focus-within:opacity-100 group-hover:opacity-100" />
                      </button>
                    )}
                  </Td>
                  <Td numeric>
                    <Money minor={tx.direction === 'credit' ? -tx.amount : tx.amount} currency={tx.currency} />
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      ) : (
        <p className="px-6 pt-2 pb-6 text-body text-ink">{t('spending.noResults')}</p>
      )}
      <CategoryRuleModal tx={editing} onClose={() => setEditing(null)} />
    </Card>
  );
}
