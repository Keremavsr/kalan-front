import { useRef, useState, type DragEvent } from 'react';
import { FileUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUploadStatement } from '../../api/queries';
import { ApiError, TRANSACTION_KINDS, type Statement } from '../../api/types';
import { Button, Card, Money, Notice, PageHeader, Rich, buttonClass, useMoneyFormatter } from '../../components/ui';
import { bankName } from '../../lib/banks';
import { formatDate } from '../../lib/format';
import { monthOf } from '../../lib/month';
import { useIntlLocale } from '../../lib/useLocale';
import { cx } from '../../lib/cx';

const MAX_BYTES = 10 * 1024 * 1024;

export function UploadPage() {
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
    if (!isPdf) return setLocalError(t('upload.notPdf'));
    if (file.size > MAX_BYTES) return setLocalError(t('upload.errTooLarge'));
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
      <PageHeader title={t('upload.title')}>
        <p>{t('upload.intro')}</p>
      </PageHeader>

      {upload.isSuccess ? (
        <UploadResult statement={upload.data} onAgain={again} />
      ) : (
        <div className="space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cx(
              'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-14 text-center',
              'transition-[border-color,background-color] duration-(--duration-fast) ease-(--ease-standard)',
              dragging ? 'border-accent bg-surface' : 'border-line-strong bg-paper',
            )}
          >
            <FileUp aria-hidden className="size-6 text-ink-muted" />
            <p className="font-medium text-ink">{t('upload.drop')}</p>
            <p className="text-sm text-ink-muted">{t('upload.or')}</p>
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
                  buttonClass('secondary'),
                  'cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus',
                  upload.isPending && 'pointer-events-none opacity-55',
                )}
              >
                {t('upload.choose')}
              </label>
            </div>
            <p className="text-xs text-ink-muted">{t('upload.limit')}</p>
          </div>

          {upload.isPending ? <Progress value={progress} /> : null}
          {localError ? (
            <Notice tone="negative" role="alert">
              {localError}
            </Notice>
          ) : null}
          {upload.isError ? <UploadError error={upload.error} /> : null}
        </div>
      )}
    </>
  );
}

function Progress({ value }: { value: number }) {
  const { t } = useTranslation();
  const parsing = value >= 1;
  return (
    <div className="enter rounded-lg border border-line bg-surface px-5 py-4">
      <div className="mb-2 flex items-baseline justify-between text-sm">
        <span id="upload-stage" className="font-medium text-ink">
          {parsing ? t('upload.stageParsing') : t('upload.stageUploading')}
        </span>
        <span className="font-mono text-xs text-ink-muted tabular">{Math.round(value * 100)}%</span>
      </div>
      <div
        role="progressbar"
        aria-label={t('upload.progress')}
        aria-describedby="upload-stage"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        className="h-1.5 overflow-hidden rounded-full bg-track"
      >
        <div
          className="h-full origin-left rounded-full bg-accent transition-transform duration-(--duration-base) ease-(--ease-out)"
          style={{ transform: `scaleX(${value})` }}
        />
      </div>
    </div>
  );
}

function UploadError({ error }: { error: Error }) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  let message = t('upload.errGeneric', { message: error.message });
  if (error instanceof ApiError) {
    if (error.code === 'unknown_format') message = t('upload.errUnknown');
    else if (error.code === 'duplicate') {
      const end = typeof error.details.period_end === 'string' ? formatDate(error.details.period_end, locale) : '';
      message = t('upload.errDuplicate', { period: end });
    } else if (error.code === 'file_too_large') message = t('upload.errTooLarge');
    else if (error.code === 'network') message = t('upload.errNetwork');
  }
  return (
    <Notice tone="negative" role="alert">
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

  const facts: Array<[string, React.ReactNode]> = [
    [t('upload.bank'), `${bankName(statement.bank)} ${statement.product}`],
    [t('upload.card'), <span className="font-mono">•••• {statement.card_last4}</span>],
    [t('upload.period'), `${formatDate(statement.period_start, locale)} – ${formatDate(statement.period_end, locale)}`],
    [t('upload.due'), formatDate(statement.due_date, locale)],
    [t('upload.total'), <Money minor={statement.statement_total} currency={c} mono />],
    [t('upload.minimum'), <Money minor={statement.minimum_payment} currency={c} mono />],
    [t('upload.lines'), <span className="font-mono tabular">{statement.transactions.length}</span>],
  ];

  return (
    <div className="enter space-y-6">
      {r.status === 'ok' ? (
        <Notice tone="positive" role="status" title={t('upload.reconOk')}>
          <Rich i18nKey="upload.reconOkBody" values={{ amount: fmt(r.expected, c) }} />
        </Notice>
      ) : (
        <Notice tone="caution" role="alert" title={t('upload.reconMismatch')}>
          <p>
            <Rich
              i18nKey="upload.reconMismatchBody"
              values={{ expected: fmt(r.expected, c), computed: fmt(r.computed, c), difference: fmt(Math.abs(r.difference), c) }}
            />{' '}
            {t('upload.reconMismatchWhy')}
          </p>
          <dl className="mt-3 grid max-w-md grid-cols-[1fr_auto] gap-x-6 gap-y-1 border-y border-line py-2 text-sm">
            <dt className="text-ink-muted">{t('upload.reconExpected')}</dt>
            <dd className="text-right">
              <Money minor={r.expected} currency={c} mono />
            </dd>
            <dt className="text-ink-muted">{t('upload.reconComputed')}</dt>
            <dd className="text-right">
              <Money minor={r.computed} currency={c} mono />
            </dd>
            <dt className="font-medium">{t('upload.reconDifference')}</dt>
            <dd className="text-right font-medium">
              <Money minor={r.difference} currency={c} mono signDisplay="exceptZero" />
            </dd>
          </dl>
          <p className="mt-3">{t('upload.reconMismatchNext')}</p>
        </Notice>
      )}

      <Card title={t('upload.resultTitle')}>
        <dl className="grid grid-cols-2 gap-x-10 gap-y-3 text-sm md:grid-cols-4">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-ink-muted">{label}</dt>
              <dd className="mt-0.5 text-ink">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-5 border-t border-line pt-4">
          <p className="text-xs text-ink-muted">{t('upload.lineTypes')}</p>
          <p className="mt-1 text-sm text-ink">
            {counts.map(([k, n], i) => (
              <span key={k}>
                {i > 0 ? <span className="text-ink-muted"> · </span> : null}
                {t(`kind.${k}`)} <span className="font-mono tabular">{n}</span>
              </span>
            ))}
          </p>
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Link to="/" className={buttonClass('primary')}>
          {t('upload.toCalendar')}
        </Link>
        <Link to={`/month/${monthOf(statement.period_end)}`} className={buttonClass('secondary')}>
          {t('upload.toMonth')}
        </Link>
        <Button variant="ghost" onClick={onAgain}>
          {t('upload.another')}
        </Button>
      </div>
    </div>
  );
}
