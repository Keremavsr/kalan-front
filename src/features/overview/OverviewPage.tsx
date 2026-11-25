import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  keys,
  useAnalysis,
  useAnalyze,
  useProviders,
  useStatement,
  useStatements,
} from '../../api/queries';
import { ApiError, type Analysis, type Statement, type StatementSummary } from '../../api/types';
import { Scribble } from '../../components/pencil';
import {
  Button,
  Card,
  Dot,
  EmptyState,
  List,
  ListRow,
  Money,
  Notice,
  PageHeader,
  QueryState,
  RollLabel,
  Section,
  SelectField,
  buttonClass,
  useToast,
} from '../../components/ui';
import { formatDate, formatDateTime, formatDayMonth } from '../../lib/format';
import { monthOf } from '../../lib/month';
import { useIntlLocale } from '../../lib/useLocale';

/**
 * Özet. Today it holds the things to watch in a statement. The next step adds, above them,
 * the forecast for the coming months and the alerts, each as its own <Section>, in this order:
 *   1. forecast (next months, from the schedule)   2. alerts   3. things to watch (below)
 */
export function OverviewPage() {
  const { t } = useTranslation();
  const statements = useStatements();
  const [chosen, setChosen] = useState<string | null>(null);
  const items = statements.data?.items ?? [];
  const selected = items.find((s) => s.id === chosen) ?? items[0];

  return (
    <>
      <PageHeader title={t('overview.title')}>{selected ? <p>{t('overview.lead')}</p> : null}</PageHeader>
      <QueryState query={statements}>
        {() =>
          selected ? (
            <Section id="watch" title={t('overview.watchTitle')}>
              <WatchBody key={selected.id} statements={items} selected={selected} onSelect={setChosen} />
            </Section>
          ) : (
            <EmptyState
              mark="empty"
              title={t('overview.noStatementsTitle')}
              action={
                <Link to="/statements" className={buttonClass('go', 'md', undefined, true)}>
                  <RollLabel>{t('overview.goUpload')}</RollLabel>
                  <Dot>
                    <ArrowRight className="size-4" />
                  </Dot>
                </Link>
              }
            >
              {t('overview.noStatements')}
            </EmptyState>
          )
        }
      </QueryState>
    </>
  );
}

interface BodyProps {
  statements: StatementSummary[];
  selected: StatementSummary;
  onSelect: (id: string) => void;
}

function WatchBody({ statements, selected, onSelect }: BodyProps) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const qc = useQueryClient();
  const toast = useToast();
  const providers = useProviders();
  const analyze = useAnalyze();
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const status = selected.analysis_status;
  const pending = analyze.isPending || status === 'pending';
  const analysis = useAnalysis(selected.id, status === 'done' && !analyze.isPending);
  const statement = useStatement(status === 'done' ? selected.id : undefined);
  const hasProvider = Boolean(providers.data?.selected);

  useEffect(() => {
    if (!analyze.isPending || startedAt === null) return;
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [analyze.isPending, startedAt]);

  // A job started before a reload: poll the list until it settles.
  useEffect(() => {
    if (status !== 'pending' || analyze.isPending) return;
    const timer = setInterval(() => void qc.invalidateQueries({ queryKey: keys.statements }), 2000);
    return () => clearInterval(timer);
  }, [status, analyze.isPending, qc]);

  function start() {
    setElapsed(0);
    setStartedAt(Date.now());
    analyze.mutate(selected.id, {
      onSuccess: () => toast.show(t('overview.done'), 'positive'),
      onSettled: () => setStartedAt(null),
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <SelectField
          label={t('overview.statement')}
          value={selected.id}
          onChange={(e) => onSelect(e.target.value)}
          fieldClassName="w-md max-w-full"
          disabled={pending}
          options={statements.map((s) => ({
            value: s.id,
            label: t('overview.statementOption', {
              period: `${formatDate(s.period_start, locale)} – ${formatDate(s.period_end, locale)}`,
              due: formatDate(s.due_date, locale),
            }),
          }))}
        />
        <Button
          variant={status === 'done' ? 'secondary' : 'primary'}
          dot={status === 'done' ? undefined : <ArrowRight aria-hidden className="size-4" />}
          onClick={start}
          loading={pending}
          disabled={!hasProvider}
        >
          {status === 'done' ? t('overview.reanalyze') : t('overview.analyze')}
        </Button>
      </div>

      {pending ? (
        <div className="enter rounded-card bg-paper px-6 py-5" role="status">
          <div className="flex items-baseline justify-between gap-4 text-body">
            <span className="font-semibold text-ink">{t('overview.pending')}</span>
            {analyze.isPending ? <span className="text-meta text-ink">{t('overview.elapsed', { seconds: elapsed })}</span> : null}
          </div>
          <div className="mt-4 h-1.5 overflow-hidden rounded-pill bg-ground-alt" aria-hidden>
            <div className="indeterminate h-full w-1/3 rounded-pill bg-ink" />
          </div>
          <p className="mt-3 text-meta text-muted">{t('overview.sentData')}</p>
        </div>
      ) : null}

      {!hasProvider && providers.isSuccess ? (
        <Notice
          tone="warning"
          title={t('overview.noProvider')}
          actions={
            <Link to="/settings" className={buttonClass('secondary', 'sm')}>
              {t('overview.goSetup')}
            </Link>
          }
        />
      ) : null}

      {analyze.isError ? (
        <Notice tone="critical" role="alert">
          {t('overview.failed', { error: analyze.error instanceof ApiError ? analyze.error.message : String(analyze.error) })}
        </Notice>
      ) : null}

      {status === 'done' ? (
        <QueryState query={analysis}>
          {() => (analysis.data ? <Commentary analysis={analysis.data} statement={statement.data} /> : null)}
        </QueryState>
      ) : status === 'failed' ? (
        <Notice tone="critical" title={t('overview.failed', { error: '' })} />
      ) : !pending ? (
        <Notice title={t('overview.none')}>{t('overview.sentData')}</Notice>
      ) : null}
    </div>
  );
}

function Commentary({ analysis, statement }: { analysis: Analysis; statement: Statement | undefined }) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const providers = useProviders();
  const providerName = providers.data?.providers.find((p) => p.id === analysis.provider)?.name ?? analysis.provider;
  const txById = new Map((statement?.transactions ?? []).map((tx) => [tx.id, tx]));
  const month = statement ? monthOf(statement.period_end) : null;

  return (
    <div className="enter grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,3fr)] lg:items-start">
      <section aria-labelledby="watch-items" className="min-w-0">
        <h3 id="watch-items" className="mb-3 text-meta font-semibold text-ink">
          {t('overview.items')}
        </h3>
        <List>
          {analysis.commentary.watch_items.map((item, i) => (
            <ListRow key={item.title} narrowMeta meta={<span className="font-bold">{i + 1}.</span>} title={item.title} detail={item.detail}>
              {item.transaction_ids.length ? (
                <div className="mt-3">
                  <p className="text-meta text-muted">{t('overview.cites')}</p>
                  <ul className="mt-1 grid gap-0.5">
                    {item.transaction_ids.map((id) => {
                      const tx = txById.get(id);
                      return (
                        <li key={id}>
                          <Link
                            to={month ? `/spending/${month}?tx=${encodeURIComponent(id)}` : '/spending'}
                            className="scribble-host group inline-flex max-w-full items-baseline gap-3 rounded-sm py-0.5 text-table"
                          >
                            {tx ? (
                              <>
                                <span className="w-14 shrink-0 text-meta text-ink">{formatDayMonth(tx.date, locale)}</span>
                                <span className="relative min-w-0 font-semibold underline decoration-1 underline-offset-4 group-hover:decoration-transparent">
                                  {tx.description}
                                  <Scribble seed={id} />
                                </span>
                                <Money minor={tx.amount} currency={tx.currency} className="text-ink" />
                              </>
                            ) : (
                              <span>{id}</span>
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : (
                <p className="mt-2 text-meta text-muted">{t('overview.noCites')}</p>
              )}
            </ListRow>
          ))}
        </List>
      </section>
      <Card title={t('overview.summary')} className="lg:sticky lg:top-(--header-height)">
        <p className="text-body text-ink">{analysis.commentary.summary}</p>
        <p className="mt-4 border-t border-line pt-3 text-meta text-muted">
          {t('overview.meta', { provider: providerName, date: formatDateTime(analysis.created_at, locale) })}{' '}
          {t('overview.disclaimer')}
        </p>
      </Card>
    </div>
  );
}
