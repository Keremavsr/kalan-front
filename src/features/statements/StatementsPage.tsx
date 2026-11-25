import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { ArrowRight, FileUp, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useStatements, useUploadStatement } from '../../api/queries';
import { ApiError, TRANSACTION_KINDS, type Statement } from '../../api/types';
import {
  Button,
  Card,
  Dot,
  KeyValue,
  List,
  ListRow,
  Money,
  Notice,
  PageHeader,
  Rich,
  RollLabel,
  Section,
  buttonClass,
  useMoneyFormatter,
} from '../../components/ui';
import { MarginMark } from '../../components/pencil';
import { bankName } from '../../lib/banks';
import { formatDate } from '../../lib/format';
import { monthOf } from '../../lib/month';
import { useIntlLocale } from '../../lib/useLocale';
import { cx } from '../../lib/cx';

const MAX_BYTES = 10 * 1024 * 1024;

export function StatementsPage() {
  const { t } = useTranslation();
  const upload = useUploadStatement();
  const [progress, setProgress] = useState(0);
  const [localError, setLocalError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function send(file: File | undefined) {
    if (!file) return;
    setLocalError(null);
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) return setLocalError(t('statements.notPdf'));
    if (file.size > MAX_BYTES) return setLocalError(t('statements.errTooLarge'));
    setProgress(0);
    upload.mutate({ file, options: { onProgress: setProgress } });
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    send(event.dataTransfer.files[0]);
  }

  function again() {
    upload.reset();
    setProgress(0);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <>
      <PageHeader title={t('statements.title')}>
        <p>{t('statements.intro')}</p>
      </PageHeader>

      <div className="grid grid-cols-1 gap-12">
        {upload.isSuccess ? (
          <UploadResult statement={upload.data} onAgain={again} />
        ) : (
          <div className="grid grid-cols-1 gap-4">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cx(
                'flex flex-col items-center justify-center gap-3 rounded-card border border-dashed px-6 py-14 text-center',
                'transition-[border-color,background-color] duration-(--duration-1) ease-(--ease-out)',
                dragging ? 'border-solid border-ink bg-ground-alt' : 'border-ink bg-paper',
              )}
            >
              <FileUp aria-hidden className="size-6 text-ink" />
              <p className="text-lead font-bold text-ink">{t('statements.drop')}</p>
              <p className="text-meta text-muted">{t('statements.or')}</p>
              <div>
                <input
                  ref={inputRef}
                  id="statement-file"
                  type="file"
                  accept="application/pdf,.pdf"
                  className="peer sr-only"
                  disabled={upload.isPending}
                  onChange={(e) => send(e.target.files?.[0])}
                />
                <label
                  htmlFor="statement-file"
                  className={cx(
                    buttonClass('go', 'md', undefined, true),
                    'cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-ink',
                    upload.isPending && 'pointer-events-none opacity-55',
                  )}
                >
                  {t('statements.choose')}
                  <Dot>
                    <Plus className="size-4" />
                  </Dot>
                </label>
              </div>
              <p className="text-meta text-muted">{t('statements.limit')}</p>
            </div>

            {upload.isPending ? <Progress value={progress} /> : null}
            {localError ? (
              <Notice tone="critical" role="alert">
                {localError}
              </Notice>
            ) : null}
            {upload.isError ? <UploadError error={upload.error} /> : null}
          </div>
        )}

        <StatementList />
      </div>
    </>
  );
}

/** Uploaded statements in the list layout: period end on the left, bank and period in the middle, balance on the right. */
function StatementList() {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const statements = useStatements();
  const items = statements.data?.items ?? [];
  if (!items.length) return null;
  return (
    <Section id="statement-list" title={t('statements.listTitle')}>
      <List label={t('statements.listLabel')}>
        {items.map((s) => (
          <ListRow
            key={s.id}
            meta={formatDate(s.period_end, locale)}
            mark={s.reconciliation.status === 'ok' ? undefined : <MarginMark className="mt-0.5" />}
            title={`${bankName(s.bank)} ${s.product}`}
            detail={
              <span className="text-meta text-muted">
                {formatDate(s.period_start, locale)} – {formatDate(s.period_end, locale)} ·{' '}
                {t('statements.listDue', { date: formatDate(s.due_date, locale) })} · •••• {s.card_last4}
                {s.reconciliation.status === 'ok' ? null : <> · {t('statements.reconMismatch')}</>}
              </span>
            }
            aside={<Money minor={s.statement_total} currency={s.currency} className="text-lead font-bold" />}
          />
        ))}
      </List>
    </Section>
  );
}

function Progress({ value }: { value: number }) {
  const { t } = useTranslation();
  const parsing = value >= 1;
  return (
    <div className="enter rounded-card bg-paper px-6 py-5">
      <div className="mb-3 flex items-baseline justify-between text-body">
        <span id="upload-stage" className="font-semibold text-ink">
          {parsing ? t('statements.stageParsing') : t('statements.stageUploading')}
        </span>
        <span className="text-meta text-ink">{Math.round(value * 100)}%</span>
      </div>
      <div
        role="progressbar"
        aria-label={t('statements.progress')}
        aria-describedby="upload-stage"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        className="h-1.5 overflow-hidden rounded-pill bg-ground-alt"
      >
        <div
          className="h-full origin-left rounded-pill bg-ink transition-transform duration-(--duration-2) ease-(--ease-out)"
          style={{ transform: `scaleX(${value})` }}
        />
      </div>
    </div>
  );
}

function UploadError({ error }: { error: Error }) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  let message = t('statements.errGeneric', { message: error.message });
  if (error instanceof ApiError) {
    if (error.code === 'unknown_format') message = t('statements.errUnknown');
    else if (error.code === 'duplicate') {
      const end = typeof error.details.period_end === 'string' ? formatDate(error.details.period_end, locale) : '';
      message = t('statements.errDuplicate', { period: end });
    } else if (error.code === 'file_too_large') message = t('statements.errTooLarge');
    else if (error.code === 'network') message = t('statements.errNetwork');
  }
  return (
    <Notice tone="critical" role="alert">
      {message}
    </Notice>
  );
}

function UploadResult({ statement, onAgain }: { statement: Statement; onAgain: () => void }) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const fmt = useMoneyFormatter();
  const c = statement.currency;
  const r = statement.reconciliation;
  const counts = TRANSACTION_KINDS.map((k) => [k, statement.transactions.filter((tx) => tx.kind === k).length] as const).filter(
    ([, n]) => n > 0,
  );

  const facts: Array<{ k: string; label: string; value: ReactNode }> = [
    { k: 'B', label: t('statements.bank'), value: `${bankName(statement.bank)} ${statement.product}` },
    { k: 'K', label: t('statements.card'), value: <span>•••• {statement.card_last4}</span> },
    {
      k: 'D',
      label: t('statements.period'),
      value: `${formatDate(statement.period_start, locale)} – ${formatDate(statement.period_end, locale)}`,
    },
    { k: 'S', label: t('statements.due'), value: formatDate(statement.due_date, locale) },
    { k: 'T', label: t('statements.total'), value: <Money minor={statement.statement_total} currency={c} /> },
    { k: 'A', label: t('statements.minimum'), value: <Money minor={statement.minimum_payment} currency={c} /> },
    { k: 'L', label: t('statements.lines'), value: statement.transactions.length },
  ];

  return (
    <div className="enter grid gap-6">
      {r.status === 'ok' ? (
        <Notice tone="done" role="status" title={t('statements.reconOk')}>
          <Rich i18nKey="statements.reconOkBody" values={{ amount: fmt(r.expected, c) }} />
        </Notice>
      ) : (
        <Notice tone="warning" role="alert" title={t('statements.reconMismatch')}>
          <p className="max-w-measure">
            <Rich
              i18nKey="statements.reconMismatchBody"
              values={{ expected: fmt(r.expected, c), computed: fmt(r.computed, c), difference: fmt(Math.abs(r.difference), c) }}
            />{' '}
            {t('statements.reconMismatchWhy')}
          </p>
          <KeyValue
            className="mt-4 max-w-md"
            items={[
              { label: t('statements.reconExpected'), value: <Money minor={r.expected} currency={c} /> },
              { label: t('statements.reconComputed'), value: <Money minor={r.computed} currency={c} /> },
              { label: t('statements.reconDifference'), value: <Money minor={r.difference} currency={c} signDisplay="exceptZero" /> },
            ]}
          />
          <p className="mt-4 max-w-measure">{t('statements.reconMismatchNext')}</p>
        </Notice>
      )}

      <Card title={t('statements.resultTitle')}>
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <KeyValue items={facts} />
          <div>
            <p className="text-meta font-semibold text-ink">{t('statements.lineTypes')}</p>
            <ul className="mt-2 border-t-2 border-ink text-meta">
              {counts.map(([k, n]) => (
                <li key={k} className="flex justify-between gap-4 border-b border-line py-2.5">
                  <span>{t(`kind.${k}`)}</span>
                  <span className="font-semibold">{n}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Link to="/installments" className={buttonClass('primary', 'md', undefined, true)}>
          <RollLabel>{t('statements.toCalendar')}</RollLabel>
          <Dot>
            <ArrowRight className="size-4" />
          </Dot>
        </Link>
        <Link to={`/spending/${monthOf(statement.period_end)}`} className={buttonClass('secondary')}>
          <RollLabel>{t('statements.toMonth')}</RollLabel>
        </Link>
        <Button variant="ghost" onClick={onAgain}>
          {t('statements.another')}
        </Button>
      </div>
    </div>
  );
}
