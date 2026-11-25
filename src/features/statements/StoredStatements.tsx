import { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDeleteStatement, useStatement, useStatements } from '../../api/queries';
import { AI_FALLBACK_PARSER, type Reconciliation, type StatementSummary } from '../../api/types';
import { Button, Card, List, ListRow, Modal, Money, Notice, QueryState, Section, useToast } from '../../components/ui';
import { MarginMark } from '../../components/pencil';
import { bankName } from '../../lib/banks';
import { formatDate } from '../../lib/format';
import { useIntlLocale } from '../../lib/useLocale';
import { TemplateDraftPanel } from './TemplateDraftPanel';
import { ReconciliationNotice, ReviewNotice, StatementFacts } from './UploadPanel';

const flagged = (s: StatementSummary) => s.needs_review || (s.reconciliation as Reconciliation | null)?.status !== 'ok';

/** Stored statements: the list, and the one opened with `?id=` above it. */
export function StoredStatements() {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const statements = useStatements();
  const [params] = useSearchParams();
  const openId = params.get('id');
  const items = statements.data?.items ?? [];

  if (statements.isError) {
    return (
      <Section id="statement-list" title={t('statements.listTitle')}>
        <QueryState query={statements}>{() => null}</QueryState>
      </Section>
    );
  }
  if (!items.length && !openId) return null;

  return (
    <>
      {openId ? <StatementDetail id={openId} /> : null}
      {items.length ? (
        <Section id="statement-list" title={t('statements.listTitle')}>
          <List label={t('statements.listLabel')}>
            {items.map((s) => {
              const r = s.reconciliation as Reconciliation | null;
              return (
                <ListRow
                  key={s.id}
                  meta={formatDate(s.period_end, locale)}
                  mark={flagged(s) ? <MarginMark className="mt-0.5" /> : undefined}
                  title={
                    <Link
                      to={`/statements?id=${encodeURIComponent(s.id)}`}
                      aria-current={s.id === openId ? 'true' : undefined}
                      className="underline decoration-transparent decoration-1 underline-offset-4 transition-[text-decoration-color] duration-(--duration-1) hover:decoration-ink aria-[current=true]:decoration-ink"
                    >
                      {bankName(s.bank)} {s.product}
                    </Link>
                  }
                  detail={
                    <span className="text-meta text-muted">
                      {formatDate(s.period_start, locale)} – {formatDate(s.period_end, locale)} ·{' '}
                      {t('statements.listDue', { date: formatDate(s.due_date, locale) })} · •••• {s.card_last4}
                      {!r ? <> · {t('statements.reconNone')}</> : r.status === 'ok' ? null : <> · {t('statements.reconMismatch')}</>}
                      {s.needs_review ? <> · {t('statements.needsReview')}</> : null}
                    </span>
                  }
                  aside={<Money minor={s.statement_total} currency={s.currency} className="text-lead font-bold" />}
                />
              );
            })}
          </List>
        </Section>
      ) : null}
    </>
  );
}

function StatementDetail({ id }: { id: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const statement = useStatement(id);
  const remove = useDeleteStatement();
  const [, setParams] = useSearchParams();
  const [confirm, setConfirm] = useState(false);
  const headingRef = useRef<HTMLDivElement>(null);

  // Opening a statement from the list or from a duplicate notice brings it into view.
  useEffect(() => {
    headingRef.current?.scrollIntoView?.({ block: 'start' });
    headingRef.current?.focus({ preventScroll: true });
  }, [id]);

  const close = () => setParams({}, { replace: true });

  function doDelete() {
    remove.mutate(id, {
      onSuccess: () => {
        setConfirm(false);
        close();
        toast.show(t('statements.deleted'), 'positive');
      },
    });
  }

  const s = statement.data;
  return (
    <div ref={headingRef} tabIndex={-1} className="scroll-mt-24 outline-none">
      {statement.isError && statement.error.code === 'statement_not_found' ? (
        <Notice tone="info" role="status" actions={<Button variant="secondary" onClick={close}>{t('common.close')}</Button>}>
          {t('statements.detailGone')}
        </Notice>
      ) : (
        <Card
          title={s ? `${bankName(s.bank)} ${s.product} · •••• ${s.card_last4}` : t('statements.detailTitle')}
          description={t('statements.detailTitle')}
          actions={
            <>
              <Button variant="ghost" size="sm" onClick={close}>
                {t('common.close')}
              </Button>
              {s ? (
                <Button variant="secondary" size="sm" icon={<Trash2 aria-hidden className="size-4" />} onClick={() => setConfirm(true)}>
                  {t('statements.delete')}
                </Button>
              ) : null}
            </>
          }
        >
          <QueryState query={statement}>
            {() =>
              s ? (
                <div className="grid gap-6">
                  <ReconciliationNotice reconciliation={s.reconciliation as Reconciliation | null} currency={s.currency} />
                  <ReviewNotice statement={s} />
                  <StatementFacts statement={s} />
                  {s.parser_id === AI_FALLBACK_PARSER ? <TemplateDraftPanel statementId={s.id} /> : null}
                </div>
              ) : null
            }
          </QueryState>
        </Card>
      )}

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title={t('statements.deleteTitle')}
        description={s ? `${bankName(s.bank)} ${s.product}, •••• ${s.card_last4}` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" loading={remove.isPending} onClick={doDelete}>
              {t('statements.deleteConfirm')}
            </Button>
          </>
        }
      >
        <p className="text-body text-ink">{t('statements.deleteBody')}</p>
        {remove.isError ? (
          <Notice tone="critical" role="alert" className="mt-4 px-0">
            {remove.error.code === 'network' ? t('statements.errNetwork') : t('statements.errGeneric', { message: remove.error.message })}
          </Notice>
        ) : null}
      </Modal>
    </div>
  );
}
