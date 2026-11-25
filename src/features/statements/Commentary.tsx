import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { keys, useAnalysis, useAnalyze, useProviders } from '../../api/queries';
import { ApiError, type Analysis, type Statement } from '../../api/types';
import { Scribble } from '../../components/pencil';
import { Button, List, ListRow, Money, Notice, QueryState, buttonClass, useToast } from '../../components/ui';
import { formatDateTime, formatDayMonth } from '../../lib/format';
import { monthOf } from '../../lib/month';
import { useIntlLocale } from '../../lib/useLocale';

/**
 * The AI tool's reading of one statement, inside the statement detail: "Yorumla" asks for it (or again),
 * the watch items cite the rows they are about. The batch run usually fills this in by itself.
 */
export function StatementCommentary({ statement }: { statement: Statement }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const providers = useProviders();
  const analyze = useAnalyze();
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const status = statement.analysis_status;
  const pending = analyze.isPending || status === 'pending';
  const analysis = useAnalysis(statement.id, status === 'done' && !analyze.isPending);
  const hasProvider = Boolean(providers.data?.selected);

  useEffect(() => {
    if (!analyze.isPending || startedAt === null) return;
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [analyze.isPending, startedAt]);

  // A job started elsewhere (the batch, or before a reload): poll until it settles.
  useEffect(() => {
    if (status !== 'pending' || analyze.isPending) return;
    const timer = setInterval(() => {
      void qc.invalidateQueries({ queryKey: keys.statements });
    }, 2000);
    return () => clearInterval(timer);
  }, [status, analyze.isPending, qc]);

  function start() {
    setElapsed(0);
    setStartedAt(Date.now());
    analyze.mutate(statement.id, {
      onSuccess: () => toast.show(t('statements.commentary.done'), 'positive'),
      onSettled: () => setStartedAt(null),
    });
  }

  return (
    <section aria-labelledby={`commentary-${statement.id}`} className="grid gap-4 border-t border-ink pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id={`commentary-${statement.id}`} className="text-title font-bold text-ink">
          {t('statements.commentary.title')}
        </h3>
        <Button
          variant={status === 'done' ? 'secondary' : 'primary'}
          size="sm"
          dot={status === 'done' ? undefined : <ArrowRight aria-hidden className="size-4" />}
          onClick={start}
          loading={pending}
          disabled={!hasProvider}
        >
          {status === 'done' ? t('statements.commentary.again') : t('statements.commentary.analyze')}
        </Button>
      </div>

      {pending ? (
        <div className="enter rounded-card bg-ground px-5 py-4" role="status">
          <div className="flex items-baseline justify-between gap-4 text-body">
            <span className="font-semibold text-ink">{t('statements.commentary.pending')}</span>
            {analyze.isPending ? <span className="text-meta text-ink">{t('statements.commentary.elapsed', { seconds: elapsed })}</span> : null}
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-pill bg-ground-alt" aria-hidden>
            <div className="indeterminate h-full w-1/3 rounded-pill bg-ink" />
          </div>
        </div>
      ) : null}

      {!hasProvider && providers.isSuccess ? (
        <Notice
          title={t('statements.commentary.noProvider')}
          actions={
            <Link to="/settings" className={buttonClass('secondary', 'sm')}>
              {t('statements.commentary.goSetup')}
            </Link>
          }
        />
      ) : null}

      {analyze.isError ? (
        <Notice tone="critical" role="alert">
          {t('statements.commentary.failed', { error: analyze.error instanceof ApiError ? analyze.error.message : String(analyze.error) })}
        </Notice>
      ) : null}

      {status === 'done' ? (
        <QueryState query={analysis}>{() => (analysis.data ? <Body analysis={analysis.data} statement={statement} /> : null)}</QueryState>
      ) : status === 'failed' ? (
        <Notice tone="critical" title={t('statements.commentary.failed', { error: '' })} />
      ) : !pending && hasProvider ? (
        <p className="text-body text-ink">{t('statements.commentary.none')}</p>
      ) : null}
      <p className="text-meta text-muted">{t('statements.commentary.sent')}</p>
    </section>
  );
}

function Body({ analysis, statement }: { analysis: Analysis; statement: Statement }) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const providers = useProviders();
  const providerName = providers.data?.providers.find((p) => p.id === analysis.provider)?.name ?? analysis.provider;
  const txById = new Map(statement.transactions.map((tx) => [tx.id, tx]));
  const month = monthOf(statement.period_end);

  return (
    <div className="enter grid gap-5">
      <p className="max-w-measure text-body text-ink">{analysis.commentary.summary}</p>
      {analysis.commentary.watch_items.length ? (
        <List label={t('statements.commentary.items')}>
          {analysis.commentary.watch_items.map((item, i) => (
            <ListRow key={item.title} narrowMeta meta={<span className="font-bold">{i + 1}.</span>} title={item.title} detail={item.detail}>
              {item.transaction_ids.length ? (
                <ul className="mt-2 grid gap-0.5">
                  {item.transaction_ids.map((id) => {
                    const tx = txById.get(id);
                    return tx ? (
                      <li key={id}>
                        <Link
                          to={`/spending/${month}?tx=${encodeURIComponent(id)}`}
                          className="scribble-host group inline-flex max-w-full items-baseline gap-3 rounded-sm py-0.5 text-table"
                        >
                          <span className="w-14 shrink-0 text-meta text-ink">{formatDayMonth(tx.date, locale)}</span>
                          <span className="relative min-w-0 font-semibold underline decoration-1 underline-offset-4 group-hover:decoration-transparent">
                            {tx.description}
                            <Scribble seed={id} />
                          </span>
                          <Money minor={tx.amount} currency={tx.currency} className="text-ink" />
                        </Link>
                      </li>
                    ) : null;
                  })}
                </ul>
              ) : null}
            </ListRow>
          ))}
        </List>
      ) : null}
      <p className="text-meta text-muted">{t('statements.commentary.meta', { provider: providerName, date: formatDateTime(analysis.created_at, locale) })}</p>
    </div>
  );
}
