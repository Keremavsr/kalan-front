import { useEffect, useState } from 'react';
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
import {
  Button,
  Card,
  Money,
  Notice,
  PageHeader,
  QueryState,
  SelectField,
  buttonClass,
  useToast,
} from '../../components/ui';
import { formatDate, formatDateTime, formatDayMonth } from '../../lib/format';
import { monthOf } from '../../lib/month';
import { useIntlLocale } from '../../lib/useLocale';

export function WatchPage() {
  const { t } = useTranslation();
  const statements = useStatements();
  const [chosen, setChosen] = useState<string | null>(null);
  const items = statements.data?.items ?? [];
  const selected = items.find((s) => s.id === chosen) ?? items[0];

  return (
    <>
      <PageHeader title={t('watch.title')} />
      <QueryState query={statements}>
        {() =>
          selected ? (
            <WatchBody key={selected.id} statements={items} selected={selected} onSelect={setChosen} />
          ) : (
            <Notice
              title={t('watch.noStatements')}
              actions={
                <Link to="/upload" className={buttonClass('secondary', 'sm')}>
                  {t('nav.upload')}
                </Link>
              }
            />
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
      onSuccess: () => toast.show(t('watch.done'), 'positive'),
      onSettled: () => setStartedAt(null),
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <SelectField
          label={t('watch.statement')}
          value={selected.id}
          onChange={(e) => onSelect(e.target.value)}
          fieldClassName="w-md"
          disabled={pending}
          options={statements.map((s) => ({
            value: s.id,
            label: t('watch.statementOption', {
              period: `${formatDate(s.period_start, locale)} – ${formatDate(s.period_end, locale)}`,
              due: formatDate(s.due_date, locale),
            }),
          }))}
        />
        <Button variant={status === 'done' ? 'secondary' : 'primary'} onClick={start} loading={pending} disabled={!hasProvider}>
          {status === 'done' ? t('watch.reanalyze') : t('watch.analyze')}
        </Button>
      </div>

      {pending ? (
        <div className="enter rounded-lg border border-line bg-surface px-5 py-4" role="status">
          <div className="flex items-baseline justify-between gap-4 text-sm">
            <span className="text-ink">{t('watch.pending')}</span>
            {analyze.isPending ? (
              <span className="font-mono text-xs text-ink-muted tabular">{t('watch.elapsed', { seconds: elapsed })}</span>
            ) : null}
          </div>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-track" aria-hidden>
            <div className="indeterminate h-full w-1/3 rounded-full bg-accent" />
          </div>
          <p className="mt-3 text-xs text-ink-muted">{t('watch.sentData')}</p>
        </div>
      ) : null}

      {!hasProvider && providers.isSuccess ? (
        <Notice
          tone="caution"
          title={t('watch.noProvider')}
          actions={
            <Link to="/setup" className={buttonClass('secondary', 'sm')}>
              {t('watch.goSetup')}
            </Link>
          }
        />
      ) : null}

      {analyze.isError ? (
        <Notice tone="negative" role="alert">
          {t('watch.failed', { error: analyze.error instanceof ApiError ? analyze.error.message : String(analyze.error) })}
        </Notice>
      ) : null}

      {status === 'done' ? (
        <QueryState query={analysis}>
          {() => (analysis.data ? <Commentary analysis={analysis.data} statement={statement.data} /> : null)}
        </QueryState>
      ) : status === 'failed' ? (
        <Notice tone="negative" title={t('watch.failed', { error: '' })} />
      ) : !pending ? (
        <Notice title={t('watch.none')}>{t('watch.sentData')}</Notice>
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
    <div className="enter grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <Card title={t('watch.summary')} className="self-start">
        <p className="text-base leading-relaxed text-ink">{analysis.commentary.summary}</p>
        <p className="mt-4 border-t border-line pt-3 text-xs text-ink-muted">
          {t('watch.meta', { provider: providerName, date: formatDateTime(analysis.created_at, locale) })}{' '}
          {t('watch.disclaimer')}
        </p>
      </Card>
      <section aria-labelledby="watch-items">
        <h2 id="watch-items" className="mb-3 font-display text-lg text-ink">
          {t('watch.items')}
        </h2>
        <ol className="divide-y divide-line rounded-lg border border-line bg-surface shadow-raised">
          {analysis.commentary.watch_items.map((item, i) => (
            <li key={item.title} className="flex gap-4 px-5 py-4">
              <span className="w-5 shrink-0 pt-0.5 font-mono text-xs text-ink-muted tabular" aria-hidden>
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-medium text-ink">{item.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink">{item.detail}</p>
                {item.transaction_ids.length ? (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-ink-muted">{t('watch.cites')}</p>
                    <ul className="mt-1 space-y-0.5">
                      {item.transaction_ids.map((id) => {
                        const tx = txById.get(id);
                        return (
                          <li key={id}>
                            <Link
                              to={month ? `/month/${month}?tx=${encodeURIComponent(id)}` : '/month'}
                              className="group inline-flex max-w-full items-baseline gap-3 rounded-sm py-0.5 text-sm"
                            >
                              {tx ? (
                                <>
                                  <span className="w-12 shrink-0 font-mono text-xs text-ink-muted tabular">
                                    {formatDayMonth(tx.date, locale)}
                                  </span>
                                  <span className="truncate text-accent underline decoration-line-strong underline-offset-4 transition-colors duration-(--duration-fast) group-hover:decoration-accent">
                                    {tx.description}
                                  </span>
                                  <Money minor={tx.amount} currency={tx.currency} className="text-ink" />
                                </>
                              ) : (
                                <span className="font-mono">{id}</span>
                              )}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-ink-muted">{t('watch.noCites')}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
