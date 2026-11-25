import { useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePdfPasswords, useProviders, useUploadStatementDetailed } from '../../api/queries';
import {
  AI_FALLBACK_PARSER,
  TRANSACTION_KINDS,
  isApiError,
  type ApiError,
  type PdfPasswordHint,
  type Reconciliation,
  type Statement,
  type StatementSummary,
  type UploadResult as UploadAnswer,
} from '../../api/types';
import { Button, Card, Dot, KeyValue, Money, Notice, Rich, RollLabel, TextField, buttonClass, useMoneyFormatter } from '../../components/ui';
import { Checkbox } from '../../components/ui/Checkbox';
import { PencilLink } from '../../components/pencil';
import { bankName } from '../../lib/banks';
import { formatDate } from '../../lib/format';
import { monthOf } from '../../lib/month';
import { useIntlLocale } from '../../lib/useLocale';
import { FileDrop } from './FileDrop';
import { GateList } from './gate';
import { TemplateDraftPanel } from './TemplateDraftPanel';

const MAX_BYTES = 10 * 1024 * 1024;

interface Attempt {
  password?: string;
  rememberPassword?: boolean;
  /** Off on the first try: an unknown layout goes to the model only after the user says yes. */
  aiFallback: boolean;
}

/** The statement upload with every answer the back end can give: password, save gate, unknown bank, duplicate. */
export function UploadPanel({ onDiagnose }: { onDiagnose: (file: File, password?: string) => void }) {
  const { t } = useTranslation();
  const upload = useUploadStatementDetailed();
  const [progress, setProgress] = useState(0);
  const [localError, setLocalError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [attempt, setAttempt] = useState<Attempt>({ aiFallback: false });

  function run(target: File, next: Attempt) {
    setAttempt(next);
    setProgress(0);
    const options = {
      onProgress: setProgress,
      aiFallback: next.aiFallback,
      ...(next.password ? { password: next.password, rememberPassword: Boolean(next.rememberPassword) } : {}),
    };
    upload.mutate({ file: target, options });
  }

  function choose(next: File) {
    setLocalError(null);
    upload.reset();
    const isPdf = next.type === 'application/pdf' || next.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) return setLocalError(t('statements.notPdf'));
    if (next.size > MAX_BYTES) return setLocalError(t('statements.errTooLarge'));
    setFile(next);
    run(next, { aiFallback: false });
  }

  function retry(patch: Partial<Attempt>) {
    if (file) run(file, { ...attempt, ...patch });
  }

  function again() {
    upload.reset();
    setProgress(0);
    setFile(null);
    setAttempt({ aiFallback: false });
  }

  if (upload.isSuccess) {
    return <UploadResult answer={upload.data} askedRemember={Boolean(attempt.rememberPassword && attempt.password)} onAgain={again} />;
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      <FileDrop
        title={t('statements.drop')}
        hint={t('statements.limit')}
        accept="application/pdf,.pdf"
        chooseLabel={t('statements.choose')}
        disabled={upload.isPending}
        onFile={choose}
      />
      {upload.isPending ? <Progress value={progress} slow={attempt.aiFallback} /> : null}
      {localError ? (
        <Notice tone="critical" role="alert">
          {localError}
        </Notice>
      ) : null}
      {upload.isError && file ? (
        <UploadProblem
          error={upload.error}
          pending={upload.isPending}
          onRetry={retry}
          onDiagnose={() => onDiagnose(file, attempt.password)}
          rememberAsked={Boolean(attempt.rememberPassword)}
        />
      ) : null}
    </div>
  );
}

function Progress({ value, slow }: { value: number; slow: boolean }) {
  const { t } = useTranslation();
  const parsing = value >= 1;
  return (
    <div className="enter rounded-card bg-paper px-6 py-5">
      <div className="mb-3 flex items-baseline justify-between gap-4 text-body">
        <span id="upload-stage" className="font-semibold text-ink">
          {parsing ? (slow ? t('statements.stageAi') : t('statements.stageParsing')) : t('statements.stageUploading')}
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
      {slow && parsing ? <p className="mt-3 text-meta text-muted">{t('statements.slowHint')}</p> : null}
    </div>
  );
}

interface ProblemProps {
  error: ApiError;
  pending: boolean;
  onRetry: (patch: Partial<Attempt>) => void;
  onDiagnose: () => void;
  rememberAsked: boolean;
}

function UploadProblem({ error, pending, onRetry, onDiagnose, rememberAsked }: ProblemProps) {
  const { t } = useTranslation();
  const diagnose = (
    <Button variant="secondary" onClick={onDiagnose}>
      {t('statements.toDiagnose')}
    </Button>
  );

  if (isApiError(error, 'pdf_password_required') || isApiError(error, 'pdf_password_wrong')) {
    return (
      <PasswordPrompt
        wrong={error.code === 'pdf_password_wrong'}
        hints={Array.isArray(error.details.hints) ? error.details.hints : []}
        rememberDefault={rememberAsked}
        pending={pending}
        onSubmit={(password, rememberPassword) => onRetry({ password, rememberPassword })}
      />
    );
  }

  if (isApiError(error, 'save_blocked')) {
    const issues = Array.isArray(error.details.issues) ? error.details.issues : [];
    return (
      <Notice tone="critical" role="alert" title={t('statements.blockedTitle')} actions={diagnose}>
        <p className="max-w-measure">{t('statements.blockedBody')}</p>
        <GateList issues={issues} currency="TRY" label={t('statements.gateLabel')} />
        <p className="mt-3 max-w-measure">{t('statements.blockedNext')}</p>
      </Notice>
    );
  }

  if (isApiError(error, 'duplicate')) {
    const id = typeof error.details.statement_id === 'string' ? error.details.statement_id : null;
    return (
      <Notice tone="info" role="alert" title={t('statements.errDuplicate')}>
        {id ? (
          <PencilLink to={`/statements?id=${encodeURIComponent(id)}`} seed={id}>
            {t('statements.openStored')}
          </PencilLink>
        ) : null}
      </Notice>
    );
  }

  if (isApiError(error, 'unknown_format')) {
    return <UnknownFormat reason={error.details.ai_fallback} onRead={() => onRetry({ aiFallback: true })} diagnose={diagnose} />;
  }

  if (isApiError(error, 'ai_fallback_failed')) {
    return (
      <Notice
        tone="critical"
        role="alert"
        title={t('statements.aiFailedTitle')}
        actions={
          <>
            <Button variant="primary" onClick={() => onRetry({ aiFallback: true })}>
              {t('statements.aiRetry')}
            </Button>
            {diagnose}
          </>
        }
      >
        {t('statements.aiFailedBody')}
      </Notice>
    );
  }

  const plain: Record<string, string> = {
    parse_error: t('statements.errParse'),
    invalid_pdf: t('statements.errInvalidPdf'),
    not_pdf: t('statements.notPdf'),
    file_too_large: t('statements.errTooLarge'),
    network: t('statements.errNetwork'),
  };
  const withDiagnose = error.code === 'parse_error';
  return (
    <Notice tone="critical" role="alert" actions={withDiagnose ? diagnose : undefined}>
      {plain[error.code] ?? t('statements.errGeneric', { message: error.message })}
    </Notice>
  );
}

/** Asks for the PDF's password; offers to remember it in the OS keyring, or says why it cannot. */
export function PasswordPrompt({
  wrong,
  hints,
  rememberDefault = false,
  pending,
  onSubmit,
  allowRemember = true,
}: {
  wrong: boolean;
  hints: PdfPasswordHint[];
  rememberDefault?: boolean;
  pending: boolean;
  onSubmit: (password: string, remember: boolean) => void;
  allowRemember?: boolean;
}) {
  const { t } = useTranslation();
  const passwords = usePdfPasswords();
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(rememberDefault);
  const [empty, setEmpty] = useState(false);
  // Until the keyring answer arrives, offer the box; the back end reports later whether it stored the password.
  const keyring = passwords.data?.keyring ?? true;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!password) return setEmpty(true);
    setEmpty(false);
    onSubmit(password, keyring && remember);
  }

  return (
    <Card as="div" title={t('statements.passwordTitle')} role="alert" className="enter">
      <form onSubmit={submit} className="grid max-w-xl gap-5" noValidate>
        <p className="text-body text-ink">{t('statements.passwordBody')}</p>
        <TextField
          label={t('statements.passwordLabel')}
          type="password"
          autoComplete="off"
          maxLength={200}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={empty ? t('statements.passwordEmpty') : wrong ? t('statements.passwordWrong') : undefined}
          autoFocus
        />
        {allowRemember ? (
          <Checkbox
            label={t('statements.passwordRemember')}
            checked={keyring && remember}
            disabled={!keyring}
            onChange={(e) => setRemember(e.target.checked)}
            hint={keyring ? t('statements.passwordRememberHint') : t('statements.passwordNoKeyring')}
          />
        ) : null}
        {hints.length ? (
          <div>
            <p className="text-meta font-semibold text-ink">{t('statements.passwordHints')}</p>
            <KeyValue className="mt-2" items={hints.map((h) => ({ label: bankName(h.bank), value: <span className="font-normal">{h.hint}</span> }))} />
          </div>
        ) : null}
        <div>
          <Button type="submit" variant="primary" loading={pending} dot={<ArrowRight className="size-4" />}>
            {t('statements.passwordSubmit')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function UnknownFormat({ reason, onRead, diagnose }: { reason: string | undefined; onRead: () => void; diagnose: ReactNode }) {
  const { t } = useTranslation();
  const providers = useProviders();
  const selected = providers.data?.providers.find((p) => p.id === providers.data?.selected);

  if (reason === 'too_long') {
    return (
      <Notice tone="warning" role="alert" title={t('statements.unknownTitle')} actions={diagnose}>
        {t('statements.unknownTooLong')}
      </Notice>
    );
  }

  if (!selected || !selected.available) {
    return (
      <Notice tone="warning" role="alert" title={t('statements.unknownTitle')} actions={diagnose}>
        <p className="max-w-measure">{t('statements.unknownNoProvider')}</p>
        <p className="mt-2">
          <PencilLink to="/settings">{t('statements.toSettings')}</PencilLink>
        </p>
      </Notice>
    );
  }

  return (
    <Card as="div" title={t('statements.unknownTitle')} role="alert" className="enter">
      <div className="grid max-w-measure gap-4">
        <p className="text-body text-ink">{t('statements.consentBody', { name: selected.name })}</p>
        <KeyValue
          items={[
            { label: t('statements.consentWhat'), value: <span className="font-normal">{t('statements.consentWhatValue')}</span> },
            { label: t('statements.consentAfter'), value: <span className="font-normal">{t('statements.consentAfterValue')}</span> },
            { label: t('statements.consentTime'), value: <span className="font-normal">{t('statements.slowHint')}</span> },
          ]}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={onRead} dot={<ArrowRight className="size-4" />}>
            {t('statements.consentYes', { name: selected.name })}
          </Button>
          {diagnose}
        </div>
      </div>
    </Card>
  );
}

function UploadResult({ answer, askedRemember, onAgain }: { answer: UploadAnswer; askedRemember: boolean; onAgain: () => void }) {
  const { t } = useTranslation();
  const statement = answer.statement;
  const aiRead = statement.parser_id === AI_FALLBACK_PARSER;

  return (
    <div className="enter grid gap-6">
      <ReconciliationNotice reconciliation={statement.reconciliation} currency={statement.currency} alert />
      <ReviewNotice statement={statement} />
      {askedRemember ? (
        answer.passwordRemembered ? (
          <Notice tone="done">{t('statements.passwordRemembered', { bank: bankName(statement.bank) })}</Notice>
        ) : (
          <Notice tone="info">{aiRead ? t('statements.passwordNotRememberedAi') : t('statements.passwordNotRemembered')}</Notice>
        )
      ) : null}

      <Card title={t('statements.resultTitle')}>
        <StatementFacts statement={statement} />
        {aiRead ? (
          <div className="mt-6">
            <TemplateDraftPanel statementId={statement.id} />
          </div>
        ) : null}
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

/** Whether the rows add up to the printed total; `null` (no check ran) is said plainly, never hidden. */
export function ReconciliationNotice({
  reconciliation: r,
  currency: c,
  alert = false,
}: {
  reconciliation: Reconciliation | null;
  currency: string;
  alert?: boolean;
}) {
  const { t } = useTranslation();
  const fmt = useMoneyFormatter();
  if (!r) return <Notice tone="info" title={t('statements.reconNone')}>{t('statements.reconNoneBody')}</Notice>;
  if (r.status === 'ok') {
    return (
      <Notice tone="done" role={alert ? 'status' : undefined} title={t('statements.reconOk')}>
        <Rich i18nKey="statements.reconOkBody" values={{ amount: fmt(r.expected, c) }} />
      </Notice>
    );
  }
  return (
    <Notice tone="warning" role={alert ? 'alert' : undefined} title={t('statements.reconMismatch')}>
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
  );
}

/** Soft save-gate findings of a stored statement. The mismatch already has its own notice above. */
export function ReviewNotice({ statement }: { statement: Statement | StatementSummary }) {
  const { t } = useTranslation();
  const mismatchShown = (statement.reconciliation as Reconciliation | null)?.status === 'mismatch';
  const issues = (statement.review ?? []).filter((i) => !(mismatchShown && i.code === 'reconciliation_mismatch'));
  const aiRead = 'parser_id' in statement && statement.parser_id === AI_FALLBACK_PARSER;
  if (!statement.needs_review && !issues.length) return null;
  return (
    <Notice tone="warning" title={t('statements.reviewTitle')}>
      <p className="max-w-measure">{aiRead ? t('statements.reviewAi') : t('statements.reviewBody')}</p>
      {issues.length ? <GateList issues={issues} currency={statement.currency} label={t('statements.reviewLabel')} /> : null}
    </Notice>
  );
}

/** The museum label of a statement and the count of each line type. */
export function StatementFacts({ statement }: { statement: Statement }) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const c = statement.currency;
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
    {
      k: 'O',
      label: t('statements.readBy'),
      value: statement.parser_id === AI_FALLBACK_PARSER ? t('statements.readByAi') : t('statements.readByTemplate'),
    },
  ];
  return (
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
  );
}
