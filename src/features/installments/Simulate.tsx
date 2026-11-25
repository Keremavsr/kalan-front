import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Schedule, Simulation, SimulationRequest } from '../../api/types';
import { ApiError } from '../../api/types';
import { Button, Notice, Rich, SelectField, TextField, useMoneyFormatter } from '../../components/ui';
import { TextButton } from '../../components/ui/TextButton';
import { formatMonth, parseAmountToMinor } from '../../lib/format';
import { useIntlLocale } from '../../lib/useLocale';

const COUNTS = [2, 3, 4, 6, 9, 12, 18, 24];

interface SimQuery {
  data: Simulation | undefined;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
}

/**
 * "What if I buy": the form sends the purchase to POST /simulate/installment and the chart above
 * draws the answer on top of today's load. The back end does every sum; this only formats them.
 */
export function SimulateForm({
  schedule,
  months,
  body,
  query,
  onSubmit,
  onClear,
}: {
  schedule: Schedule;
  months: number;
  body: SimulationRequest | undefined;
  query: SimQuery;
  onSubmit: (body: SimulationRequest) => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const c = schedule.currency;
  const [amount, setAmount] = useState('');
  const [count, setCount] = useState('6');
  const [start, setStart] = useState(schedule.months[0]?.month ?? '');
  const [interest, setInterest] = useState('');
  const [errors, setErrors] = useState<{ amount?: string; interest?: string }>({});

  function submit(event: FormEvent) {
    event.preventDefault();
    const minor = parseAmountToMinor(amount, locale, c);
    const rateText = interest.trim().replace(',', '.');
    const rateOk = !rateText || /^\d{1,2}(\.\d{1,2})?$/.test(rateText);
    const next = {
      amount: minor === null ? t('installments.sim.amountError') : undefined,
      interest: rateOk ? undefined : t('installments.sim.interestError'),
    };
    setErrors(next);
    if (minor === null || !rateOk) return;
    onSubmit({ amount: minor, count: Number(count), start_month: start, interest_monthly: rateText || null, months });
  }

  return (
    <div className="grid gap-5">
      <p className="max-w-measure text-body text-ink">{t('installments.sim.intro')}</p>
      <form onSubmit={submit} noValidate className="flex flex-wrap items-start gap-x-4 gap-y-4">
        <TextField
          label={t('installments.sim.amount')}
          hint={t('installments.sim.amountHint')}
          error={errors.amount}
          inputMode="decimal"
          autoComplete="off"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          fieldClassName="w-44"
        />
        <SelectField
          label={t('installments.sim.count')}
          value={count}
          onChange={(e) => setCount(e.target.value)}
          options={COUNTS.map((n) => ({ value: String(n), label: t('installments.sim.countOption', { count: n }) }))}
          fieldClassName="w-40"
        />
        <SelectField
          label={t('installments.sim.start')}
          value={start}
          onChange={(e) => setStart(e.target.value)}
          options={schedule.months.map((m) => ({ value: m.month, label: formatMonth(m.month, locale) }))}
          fieldClassName="w-44"
        />
        <TextField
          label={t('installments.sim.interest')}
          hint={t('installments.sim.interestHint')}
          error={errors.interest}
          inputMode="decimal"
          autoComplete="off"
          value={interest}
          onChange={(e) => setInterest(e.target.value)}
          fieldClassName="w-52"
        />
        <div className="flex items-center gap-3 pt-6">
          <Button type="submit" variant="primary" loading={query.isFetching}>
            {t('installments.sim.run')}
          </Button>
          {body ? (
            <TextButton onClick={onClear}>{t('installments.sim.clear')}</TextButton>
          ) : null}
        </div>
      </form>
      {body && query.isError ? (
        <Notice tone="warning" role="alert">
          {t('installments.sim.error', { error: query.error instanceof ApiError ? query.error.message : String(query.error) })}
        </Notice>
      ) : null}
      {body && query.data ? <SimResult sim={query.data} schedule={schedule} /> : null}
    </div>
  );
}

function SimResult({ sim, schedule }: { sim: Simulation; schedule: Schedule }) {
  const locale = useIntlLocale();
  const fmt = useMoneyFormatter();
  const c = sim.currency;
  const p = sim.purchase;
  const each = (p.installments[1] ?? p.installments[0])?.amount ?? 0;
  const lastShown = schedule.months.at(-1)?.month ?? p.ends;
  const month = (m: string) => formatMonth(m, locale);
  const samePeak = sim.peak.with.month === sim.peak.without.month;

  return (
    <div className="enter grid max-w-measure gap-1.5 text-body text-ink" role="status">
      <p>
        <Rich i18nKey="installments.sim.result" values={{ start: month(p.start_month), ends: month(p.ends), each: fmt(each, c) }} />{' '}
        {samePeak ? (
          <Rich
            i18nKey="installments.sim.peakSame"
            values={{ month: month(sim.peak.with.month), total: fmt(sim.peak.with.total, c), now: fmt(sim.peak.without.total, c) }}
          />
        ) : (
          <Rich
            i18nKey="installments.sim.peak"
            values={{
              month: month(sim.peak.with.month),
              total: fmt(sim.peak.with.total, c),
              nowMonth: month(sim.peak.without.month),
              now: fmt(sim.peak.without.total, c),
            }}
          />
        )}
      </p>
      {p.interest_monthly && p.interest_total ? (
        <p>
          <Rich i18nKey="installments.sim.cost" values={{ total: fmt(p.total_cost, c), interest: fmt(p.interest_total, c) }} />
        </p>
      ) : null}
      {p.ends > lastShown ? <p className="text-meta text-muted"><Rich i18nKey="installments.sim.beyond" values={{ ends: month(p.ends) }} /></p> : null}
    </div>
  );
}
