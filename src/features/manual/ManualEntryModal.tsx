import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useCreateTransaction, useSettings } from '../../api/queries';
import { ApiError } from '../../api/types';
import { Button, Modal, Notice, SelectField, TextField, useMoneyFormatter, useToast } from '../../components/ui';
import { DateField } from '../../components/ui/DateField';
import { parseAmountToMinor } from '../../lib/format';
import { useIntlLocale } from '../../lib/useLocale';

const COUNTS = [1, 2, 3, 4, 5, 6, 9, 12, 18, 24];

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface Errors {
  description?: string;
  amount?: string;
  date?: string;
}

export function ManualEntryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const fmt = useMoneyFormatter();
  const toast = useToast();
  const settings = useSettings();
  const create = useCreateTransaction();
  const currency = settings.data?.base_currency ?? 'TRY';

  const [date, setDate] = useState(today);
  const [description, setDescription] = useState('');
  const [amountText, setAmountText] = useState('');
  const [count, setCount] = useState(1);
  const [errors, setErrors] = useState<Errors>({});

  const amount = parseAmountToMinor(amountText, locale, currency);
  // Equal split rounded down to the minor unit; the back end owns the exact plan.
  const each = amount && count > 1 ? Math.floor(amount / count) : null;

  function reset() {
    setDate(today());
    setDescription('');
    setAmountText('');
    setCount(1);
    setErrors({});
    create.reset();
  }

  function close() {
    reset();
    onClose();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const next: Errors = {};
    if (!date) next.date = t('manual.required');
    if (!description.trim()) next.description = t('manual.required');
    if (!amountText.trim()) next.amount = t('manual.required');
    else if (amount === null) next.amount = t('manual.amountInvalid');
    setErrors(next);
    if (Object.keys(next).length || amount === null) return;

    create.mutate(
      {
        date,
        description: description.trim(),
        amount,
        currency,
        direction: 'debit',
        installment: count > 1 ? { total_count: count, amount_each: Math.floor(amount / count) } : null,
      },
      {
        onSuccess: () => {
          toast.show(count > 1 ? t('manual.addedPlan', { count }) : t('manual.added'), 'positive');
          close();
        },
      },
    );
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('manual.title')}
      description={t('manual.intro')}
      footer={
        <>
          <Button variant="ghost" onClick={close}>{t('common.cancel')}</Button>
          <Button variant="go" type="submit" form="manual-entry" loading={create.isPending}>
            {t('manual.submit')}
          </Button>
        </>
      }
    >
      <form id="manual-entry" noValidate onSubmit={submit} className="grid grid-cols-2 gap-4">
        <TextField
          label={t('manual.description')}
          hint={t('manual.descriptionHint')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={errors.description}
          fieldClassName="col-span-2"
          autoComplete="off"
        />
        {/* Day, month name and year in the app language; the native date input would follow the OS locale. */}
        <DateField
          label={t('manual.date')}
          locale={locale}
          value={date}
          onChange={setDate}
          years={[new Date().getFullYear() - 2, new Date().getFullYear() + 1]}
          parts={{ day: t('manual.day'), month: t('manual.month'), year: t('manual.year') }}
          error={errors.date}
          className="col-span-2"
        />
        <TextField
          label={t('manual.amount')}
          hint={t('manual.amountHint')}
          inputMode="decimal"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
          error={errors.amount}
          className="text-right"
          autoComplete="off"
        />
        <SelectField
          label={t('manual.installments')}
          value={String(count)}
          onChange={(e) => setCount(Number(e.target.value))}
          options={COUNTS.map((n) => ({ value: String(n), label: n === 1 ? t('manual.single') : t('manual.count', { count: n }) }))}
        />
        <p className="self-end pb-3 text-meta text-ink" aria-live="polite">
          {each ? t('manual.each', { amount: fmt(each, currency) }) : null}
        </p>
        {create.isError ? (
          <Notice tone="critical" role="alert" className="col-span-2">
            {create.error instanceof ApiError ? create.error.message : String(create.error)}
          </Notice>
        ) : null}
      </form>
    </Modal>
  );
}
