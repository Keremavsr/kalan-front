import { useState } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  useAddCancelledSubscription,
  useAlerts,
  useCancelledSubscriptions,
  useDeleteCancelledSubscription,
  useSetSubscriptionExpected,
} from '../../api/queries';
import { isApiError, type Alert, type CancelledSubscription, type RecurringKind, type Subscription } from '../../api/types';
import { Button, List, ListRow, Modal, Money, Notice, TextField, useMoneyFormatter, useToast } from '../../components/ui';
import { DateField } from '../../components/ui/DateField';
import { useErrorText } from '../../components/ui/errorText';
import { MarginMark } from '../../components/pencil';
import { foldForSearch, formatDate, formatMonthName, formatPercent, parseAmountToMinor } from '../../lib/format';
import { useIntlLocale } from '../../lib/useLocale';
import { cx } from '../../lib/cx';
import { today, yearsAround } from './dates';

/** A small underlined action that lines up with the text of the row (the ghost pill would indent it). */
const textAction = cx(
  'text-meta font-semibold text-ink underline decoration-1 underline-offset-4',
  'transition-[text-decoration-color] duration-(--duration-1) ease-(--ease-out) hover:decoration-transparent',
  'disabled:cursor-wait disabled:opacity-55',
);

interface Row {
  merchant: string;
  sub: Subscription | null;
  cancelled: CancelledSubscription | null;
  /** The `charged_after_cancel` alert for this merchant, if the back end raised one. */
  after: Alert | null;
}

/**
 * Subscriptions with the user's "I cancelled it" mark. A cancelled merchant that no longer shows up as a
 * subscription stays in the list so the mark can be undone. The back end decides whether a charge came after
 * the cancellation (`charged_after_cancel` alert); the screen only shows it.
 */
export function Subscriptions({ items, kind = 'subscription' }: { items: Subscription[]; kind?: RecurringKind }) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const errorText = useErrorText();
  const cancelled = useCancelledSubscriptions();
  const alerts = useAlerts();
  const [marking, setMarking] = useState<string | null>(null);
  const [changing, setChanging] = useState<Subscription | null>(null);
  const isBill = kind === 'bill';

  const fold = (s: string) => foldForSearch(s, locale);
  // The back end matches a cancelled name inside the row merchant, ignoring case and accents; do the same here.
  const sameMerchant = (row: string, mark: string) => fold(row).includes(fold(mark));
  const marks = cancelled.data?.items ?? [];
  const afterAlerts = (alerts.data?.items ?? []).filter((a) => a.kind === 'charged_after_cancel');
  const alertFor = (mark: CancelledSubscription) =>
    afterAlerts.find((a) => typeof a.params.merchant === 'string' && fold(a.params.merchant) === fold(mark.merchant)) ?? null;

  const rows: Row[] = items.map((sub) => {
    const mark = marks.find((m) => sameMerchant(sub.merchant, m.merchant)) ?? null;
    return { merchant: sub.merchant, sub, cancelled: mark, after: mark ? alertFor(mark) : null };
  });
  if (!isBill) {
    for (const mark of marks) {
      if (!rows.some((r) => r.cancelled === mark)) rows.push({ merchant: mark.merchant, sub: null, cancelled: mark, after: alertFor(mark) });
    }
  }

  return (
    <div className="grid gap-5">
      {cancelled.isError && !isBill ? (
        <Notice
          tone="warning"
          role="alert"
          title={t('recurring.cancel.listFailed')}
          actions={
            <Button variant="secondary" size="sm" onClick={() => void cancelled.refetch()}>
              {t('common.retry')}
            </Button>
          }
        >
          {errorText(cancelled.error, '') || null}
        </Notice>
      ) : null}
      <List label={isBill ? t('recurring.billsLabel') : t('recurring.listLabel')}>
        {rows.map((row) => (
          <SubscriptionRow
            key={row.merchant}
            row={row}
            bill={isBill}
            marksReady={cancelled.isSuccess}
            onMark={() => setMarking(row.merchant)}
            onChange={() => row.sub && setChanging(row.sub)}
          />
        ))}
      </List>
      <p className="max-w-measure text-meta text-muted">{isBill ? t('recurring.billRule') : t('recurring.rule')}</p>
      {isBill ? null : <CancelModal merchant={marking} onClose={() => setMarking(null)} />}
      {isBill ? null : <ExpectedModal sub={changing} onClose={() => setChanging(null)} />}
    </div>
  );
}

/**
 * One charge: how long it has come on the left, the merchant, its card and the months in the middle, the monthly amount
 * on the right. A subscription can take a new amount ("Tutar değişti") and the cancel mark; a bill only shows.
 */
function SubscriptionRow({
  row,
  bill,
  marksReady,
  onMark,
  onChange,
}: {
  row: Row;
  bill: boolean;
  marksReady: boolean;
  onMark: () => void;
  onChange: () => void;
}) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const fmt = useMoneyFormatter();
  const s = row.sub;
  const change = s?.price_change && !s.expected_amount ? Number(s.price_change) : 0;
  const months = s ? s.months_seen.map((m) => `${formatMonthName(m, locale)} ${m.slice(2, 4)}`).join(', ') : '';
  const critical = Boolean(row.after);
  const shown = s ? (s.monthly_amount ?? s.amount_last) : 0;

  return (
    <ListRow
      meta={s ? t('recurring.seen', { count: s.months_seen.length }) : t('recurring.cancel.notRecurring')}
      title={row.merchant}
      mark={critical ? <MarginMark className="mt-1" /> : undefined}
      detail={
        s ? (
          <span className="text-meta text-muted">
            {s.card_label ? `${s.card_label} · ` : ''}
            {months}
            {s.amount_previous !== null ? <> · {t('recurring.previous', { amount: fmt(s.amount_previous, s.currency) })}</> : null}
          </span>
        ) : null
      }
      aside={
        s ? (
          <span className="grid justify-items-end gap-0.5">
            <Money minor={shown} currency={s.currency} className="text-lead font-bold" />
            {s.expected_amount ? (
              <span className="text-muted">{t('recurring.expected.label')}</span>
            ) : bill ? (
              <span className="text-muted">{t('recurring.billVaries')}</span>
            ) : change > 0 ? (
              <span className="inline-flex items-center gap-1 font-semibold">
                <ArrowUpRight aria-hidden className="size-3.5" />
                {formatPercent(s.price_change!, locale, { signDisplay: 'exceptZero' })}
              </span>
            ) : change < 0 ? (
              <span className="inline-flex items-center gap-1 font-semibold">
                <ArrowDownRight aria-hidden className="size-3.5" />
                {formatPercent(s.price_change!, locale, { signDisplay: 'exceptZero' })}
              </span>
            ) : (
              <span className="text-muted">{t('recurring.same')}</span>
            )}
          </span>
        ) : null
      }
    >
      {bill ? null : (
        <div className="flex flex-wrap items-start gap-x-5">
          {s ? <ExpectedState sub={s} onChange={onChange} /> : null}
          <CancelState row={row} marksReady={marksReady} onMark={onMark} />
        </div>
      )}
    </ListRow>
  );
}

function CancelState({ row, marksReady, onMark }: { row: Row; marksReady: boolean; onMark: () => void }) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const fmt = useMoneyFormatter();
  const toast = useToast();
  const errorText = useErrorText();
  const undo = useDeleteCancelledSubscription();
  const [failed, setFailed] = useState<string | null>(null);

  if (!row.cancelled) {
    if (!marksReady) return null;
    return (
      <div className="mt-2">
        <button type="button" className={textAction} onClick={onMark} aria-label={t('recurring.cancel.markFor', { merchant: row.merchant })}>
          {t('recurring.cancel.mark')}
        </button>
      </div>
    );
  }

  const mark = row.cancelled;
  const on = formatDate(mark.cancelled_on, locale);
  const after = row.after;
  const txId = after?.refs.transaction_ids.at(-1);

  function remove() {
    setFailed(null);
    undo.mutate(mark.merchant, {
      onSuccess: () => toast.show(t('recurring.cancel.undone', { merchant: mark.merchant }), 'positive'),
      onError: (error) => {
        if (isApiError(error, 'cancellation_not_found')) {
          toast.show(t('recurring.cancel.gone'), 'neutral');
          return;
        }
        setFailed(errorText(error, t('recurring.cancel.undoFailed')));
      },
    });
  }

  return (
    <div className="mt-2 grid basis-full gap-2">
      <p className="text-body text-ink">
        {after ? (
          <>
            <span className="mr-2 font-bold">{t('common.critical')}</span>
            {t('recurring.cancel.chargedAfter', {
              date: on,
              count: Number(after.params.count ?? 0),
              amount: fmt(Number(after.params.total ?? 0), String(after.params.currency ?? 'TRY')),
            })}
          </>
        ) : (
          t('recurring.cancel.marked', { date: on })
        )}
      </p>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {after && txId ? (
          <Link to={`/spending/${after.month}?tx=${txId}`} className={textAction}>
            {t('recurring.cancel.seeCharge')}
          </Link>
        ) : null}
        <button
          type="button"
          className={textAction}
          onClick={remove}
          disabled={undo.isPending}
          aria-busy={undo.isPending || undefined}
          aria-label={t('recurring.cancel.undoFor', { merchant: mark.merchant })}
        >
          {t('recurring.cancel.undo')}
        </button>
      </div>
      {failed ? (
        <Notice tone="critical" role="alert">
          {failed}
        </Notice>
      ) : null}
    </div>
  );
}

function CancelModal({ merchant, onClose }: { merchant: string | null; onClose: () => void }) {
  // Keep the merchant while the sheet closes; a new opening is a fresh sheet.
  const [state, setState] = useState({ merchant, open: Boolean(merchant), n: 0 });
  if (merchant && (!state.open || merchant !== state.merchant)) setState({ merchant, open: true, n: state.n + 1 });
  else if (!merchant && state.open) setState({ ...state, open: false });
  return state.merchant ? <CancelSheet key={state.n} merchant={state.merchant} open={state.open} onClose={onClose} /> : null;
}

function CancelSheet({ merchant, open, onClose }: { merchant: string; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const toast = useToast();
  const errorText = useErrorText();
  const add = useAddCancelledSubscription();
  const [date, setDate] = useState(today);

  function save() {
    add.mutate(
      { merchant, cancelled_on: date },
      {
        onSuccess: () => {
          toast.show(t('recurring.cancel.saved', { merchant }), 'positive');
          onClose();
        },
      },
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('recurring.cancel.title', { merchant })}
      description={t('recurring.cancel.intro')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="go" onClick={save} loading={add.isPending} disabled={!date}>
            {t('recurring.cancel.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <DateField
          label={t('recurring.cancel.date')}
          locale={locale}
          value={date}
          onChange={setDate}
          years={yearsAround(-3, 0)}
          parts={{ day: t('recurring.parts.day'), month: t('recurring.parts.month'), year: t('recurring.parts.year') }}
        />
        {add.isError ? (
          <Notice tone="critical" role="alert" className="-mx-5">
            {errorText(add.error, t('recurring.cancel.saveFailed'), { validation_error: t('recurring.cancel.invalid') })}
          </Notice>
        ) : null}
      </div>
    </Modal>
  );
}

/** The amount the user said the subscription changed to, or the action to say so. */
function ExpectedState({ sub, onChange }: { sub: Subscription; onChange: () => void }) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const fmt = useMoneyFormatter();
  const toast = useToast();
  const clear = useSetSubscriptionExpected();
  if (!sub.id) return null;
  if (!sub.expected_amount) {
    return (
      <div className="mt-2">
        <button type="button" className={textAction} onClick={onChange} aria-label={t('recurring.expected.openFor', { merchant: sub.merchant })}>
          {t('recurring.expected.open')}
        </button>
      </div>
    );
  }
  return (
    <div className="mt-2 grid basis-full gap-1">
      <p className="text-body text-ink">
        {t('recurring.expected.set', {
          amount: fmt(sub.expected_amount, sub.currency),
          date: sub.expected_since ? formatDate(sub.expected_since, locale) : '',
          last: fmt(sub.amount_last, sub.currency),
        })}
      </p>
      <div className="flex flex-wrap gap-x-5">
        <button type="button" className={textAction} onClick={onChange}>
          {t('recurring.expected.edit')}
        </button>
        <button
          type="button"
          className={textAction}
          disabled={clear.isPending}
          aria-label={t('recurring.expected.clearFor', { merchant: sub.merchant })}
          onClick={() =>
            clear.mutate(
              { id: sub.id!, amount: null },
              { onSuccess: () => toast.show(t('recurring.expected.cleared', { merchant: sub.merchant }), 'positive') },
            )
          }
        >
          {t('recurring.expected.clear')}
        </button>
      </div>
    </div>
  );
}

function ExpectedModal({ sub, onClose }: { sub: Subscription | null; onClose: () => void }) {
  const [state, setState] = useState({ sub, n: 0 });
  if (sub && sub !== state.sub) setState({ sub, n: state.n + 1 });
  return state.sub ? <ExpectedSheet key={state.n} sub={state.sub} open={Boolean(sub)} onClose={onClose} /> : null;
}

function ExpectedSheet({ sub, open, onClose }: { sub: Subscription; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const toast = useToast();
  const errorText = useErrorText();
  const save = useSetSubscriptionExpected();
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState(false);

  function submit() {
    const amount = parseAmountToMinor(text, locale, sub.currency);
    if (!amount || amount <= 0) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    save.mutate(
      { id: sub.id!, amount },
      {
        onSuccess: () => {
          toast.show(t('recurring.expected.saved', { merchant: sub.merchant }), 'positive');
          onClose();
        },
      },
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('recurring.expected.title', { merchant: sub.merchant })}
      description={t('recurring.expected.intro')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="go" onClick={submit} loading={save.isPending}>
            {t('recurring.expected.save')}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <TextField
          label={t('recurring.expected.amount')}
          inputMode="decimal"
          autoComplete="off"
          value={text}
          onChange={(e) => setText(e.target.value)}
          hint={t('recurring.expected.hint')}
          error={invalid ? t('recurring.expected.invalid') : undefined}
        />
      </form>
      {save.isError ? (
        <Notice tone="critical" role="alert" className="mt-4 -mx-5">
          {errorText(save.error, t('recurring.expected.failed'))}
        </Notice>
      ) : null}
    </Modal>
  );
}
