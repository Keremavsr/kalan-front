import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useEarlyPayoff } from '../../api/queries';
import { ApiError, type Payoff, type SchedulePlan } from '../../api/types';
import { Button, Modal, Notice, Rich, SelectField, Table, TBody, THead, Td, Th, Tr, Money, useMoneyFormatter } from '../../components/ui';
import { formatMonth } from '../../lib/format';
import { useIntlLocale } from '../../lib/useLocale';

/**
 * Early payoff of one plan, opened from its row in the plan table. The user picks the month; the back end
 * bills every later installment in that month and returns the plain remaining amount. kalan knows no
 * bank's payoff discount, so that is said every time.
 */
export function EarlyPayoffDialog({
  plan,
  months,
  onClose,
}: {
  plan: SchedulePlan | null;
  months: string[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const [month, setMonth] = useState<string | undefined>(undefined);
  const effective = month ?? months[0];
  const payoff = useEarlyPayoff(plan?.plan_id, effective);

  function close() {
    setMonth(undefined);
    onClose();
  }

  return (
    <Modal
      open={Boolean(plan)}
      onClose={close}
      title={plan ? t('installments.payoff.title', { plan: plan.description }) : ''}
      description={t('installments.payoff.description')}
      footer={
        <Button variant="secondary" onClick={close}>
          {t('common.close')}
        </Button>
      }
    >
      {plan ? (
        <div className="grid gap-5">
          <SelectField
            label={t('installments.payoff.month')}
            value={effective ?? ''}
            onChange={(e) => setMonth(e.target.value)}
            options={months.map((m) => ({ value: m, label: formatMonth(m, locale) }))}
            fieldClassName="w-56"
          />
          <div aria-live="polite" className="grid gap-4">
            {payoff.isPending ? (
              <p className="text-body text-muted" role="status">
                {t('common.loading')}
              </p>
            ) : payoff.isError ? (
              <Notice tone="warning" role="alert">
                {payoff.error instanceof ApiError && payoff.error.code === 'plan_not_found'
                  ? t('installments.payoff.notFound')
                  : payoff.error instanceof ApiError && payoff.error.code === 'month_outside_schedule'
                    ? t('installments.payoff.outside')
                    : t('installments.payoff.failed')}
              </Notice>
            ) : (
              <PayoffResult payoff={payoff.data} />
            )}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

function PayoffResult({ payoff }: { payoff: Payoff }) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const fmt = useMoneyFormatter();
  const c = payoff.currency;
  const month = formatMonth(payoff.payoff_month, locale);
  const changed = payoff.schedule_effect.filter((m) => m.with !== m.without);

  return (
    <>
      <p className="text-body text-ink">
        {payoff.remaining_count > 0 ? (
          <Rich
            i18nKey="installments.payoff.lead"
            values={{ month, count: payoff.remaining_count, amount: fmt(payoff.remaining_total, c) }}
          />
        ) : (
          t('installments.payoff.nothing', { month })
        )}
      </p>
      {payoff.remaining_count > 0 && payoff.would_save_if_future_interest_dropped && payoff.remaining_principal !== null ? (
        <p className="text-body text-ink">
          <Rich
            i18nKey="installments.payoff.principal"
            values={{ principal: fmt(payoff.remaining_principal, c), save: fmt(payoff.would_save_if_future_interest_dropped, c) }}
          />
        </p>
      ) : null}
      <p className="text-meta text-muted">{t('installments.payoff.note')}</p>
      {changed.length ? (
        <Table caption={t('installments.payoff.effect')} className="-mx-6">
          <THead>
            <Tr>
              <Th>{t('installments.payoff.colMonth')}</Th>
              <Th numeric>{t('installments.payoff.colWithout')}</Th>
              <Th numeric>{t('installments.payoff.colWith')}</Th>
            </Tr>
          </THead>
          <TBody>
            {changed.map((m) => (
              <Tr key={m.month}>
                <Th scope="row" className="font-normal">
                  {formatMonth(m.month, locale)}
                </Th>
                <Td numeric>
                  <Money minor={m.without} currency={c} />
                </Td>
                <Td numeric className="font-semibold">
                  <Money minor={m.with} currency={c} />
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      ) : payoff.remaining_count > 0 ? (
        <p className="text-meta text-muted">{t('installments.payoff.noEffect')}</p>
      ) : null}
    </>
  );
}
