import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMinimumPayment, useStatements } from '../../api/queries';
import type { MinimumPaymentPlan, ValueSource } from '../../api/types';
import {
  Button,
  EmptyState,
  KeyValue,
  Money,
  Notice,
  QueryState,
  Rich,
  Section,
  SelectField,
  StackedBar,
  TBody,
  THead,
  Table,
  Td,
  Th,
  Tr,
  buttonClass,
  useMoneyFormatter,
} from '../../components/ui';
import { Checkbox } from '../../components/ui/Checkbox';
import { bankName } from '../../lib/banks';
import { formatDate } from '../../lib/format';
import { useIntlLocale } from '../../lib/useLocale';

const FIRST_ROWS = 12;
/** Assumption keys the back end sends; anything else is shown in its own words. */
const KNOWN_ASSUMPTIONS = new Set([
  'minimum_paid_on_time',
  'interest_on_unpaid_only',
  'rates_follow_caps',
  'scheduled_installments_added',
  'no_new_spending',
  'cut_off_day_kept',
]);

/** What paying only the minimum costs: how many statements, the interest and taxes, and where each rate comes from. */
export function MinimumPaymentSection() {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const statements = useStatements();
  const [statementId, setStatementId] = useState<string>('');
  const [withInstallments, setWithInstallments] = useState(false);
  const plan = useMinimumPayment({ ...(statementId ? { statement_id: statementId } : {}), include_installments: withInstallments });
  const items = statements.data?.items ?? [];

  const noStatements = plan.isError && plan.error.code === 'no_statements';

  return (
    <Section id="minimum" band title={t('rights.minTitle')} description={t('rights.minIntro')}>
      {noStatements ? (
        <EmptyState
          mark="empty"
          title={t('rights.minEmptyTitle')}
          action={
            <Link to="/statements" className={buttonClass('secondary')}>
              {t('rights.toStatements')}
            </Link>
          }
        >
          {t('rights.minEmpty')}
        </EmptyState>
      ) : (
        <div className="grid gap-6">
          <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
            {items.length > 1 ? (
              <SelectField
                label={t('rights.minStatement')}
                fieldClassName="w-full max-w-sm"
                value={statementId}
                onChange={(e) => setStatementId(e.target.value)}
                options={[
                  { value: '', label: t('rights.minLatest') },
                  ...items.map((s) => ({
                    value: s.id,
                    label: `${bankName(s.bank)} •••• ${s.card_last4}, ${formatDate(s.period_end, locale)}`,
                  })),
                ]}
              />
            ) : null}
            <Checkbox
              className="pb-2.5"
              label={t('rights.minWithInstallments')}
              checked={withInstallments}
              onChange={(e) => setWithInstallments(e.target.checked)}
            />
          </div>
          {plan.isError && plan.error.code === 'statement_not_found' ? (
            <Notice tone="info" role="status" actions={<Button variant="secondary" onClick={() => setStatementId('')}>{t('rights.minLatest')}</Button>}>
              {t('rights.minGone')}
            </Notice>
          ) : (
            <QueryState query={plan}>{() => (plan.data ? <MinimumResult plan={plan.data} /> : null)}</QueryState>
          )}
        </div>
      )}
    </Section>
  );
}

function MinimumResult({ plan }: { plan: MinimumPaymentPlan }) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const fmt = useMoneyFormatter();
  const c = plan.currency;
  const m = plan.minimum_only;
  const [all, setAll] = useState(false);
  const rows = all ? plan.cycles : plan.cycles.slice(0, FIRST_ROWS);
  const pct = (v: string, percent: boolean) =>
    new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 2 }).format(percent ? Number(v) / 100 : Number(v));
  const source = (s: ValueSource) => t(`rights.source_${s}`);

  return (
    <div className="enter grid gap-8">
      <p className="max-w-measure text-lead text-ink [text-wrap:pretty]">
        {m.paid_off ? (
          <Rich
            i18nKey="rights.minSentence"
            count={m.cycles}
            values={{
              balance: fmt(plan.start_balance, c),
              count: m.cycles,
              date: m.last_payment_cut_off ? formatDate(m.last_payment_cut_off, locale, 'long') : '–',
              cost: fmt(plan.extra_cost, c),
            }}
          />
        ) : (
          <Rich i18nKey="rights.minSentenceOpen" count={m.cycles} values={{ balance: fmt(plan.start_balance, c), count: m.cycles, left: fmt(m.balance_left, c) }} />
        )}
      </p>

      <StackedBar
        label={t('rights.minBarLabel', {
          balance: fmt(plan.start_balance, c),
          interest: fmt(m.interest, c),
          bsmv: fmt(m.bsmv, c),
          kkdf: fmt(m.kkdf, c),
        })}
        parts={[
          { key: 'balance', value: plan.start_balance, series: 'ink', label: t('rights.partBalance') },
          { key: 'interest', value: m.interest, series: 'gri', label: t('rights.partInterest') },
          { key: 'bsmv', value: m.bsmv, series: 'gri', label: 'BSMV' },
          { key: 'kkdf', value: m.kkdf, series: 'gri', label: 'KKDF' },
        ]}
        caption={t('rights.minBarCaption', { full: fmt(plan.pay_in_full.total_paid, c) })}
      />

      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <h3 className="text-meta font-semibold text-ink">{t('rights.minFigures')}</h3>
          <KeyValue
            className="mt-2"
            items={[
              { label: t('rights.minStart'), value: <Money minor={plan.start_balance} currency={c} /> },
              { label: t('rights.minCycles'), value: t('rights.minCyclesValue', { count: m.cycles }) },
              { label: t('rights.minTotalPaid'), value: <Money minor={m.total_paid} currency={c} /> },
              { label: t('rights.partInterest'), value: <Money minor={m.interest} currency={c} /> },
              { label: 'BSMV', value: <Money minor={m.bsmv} currency={c} /> },
              { label: 'KKDF', value: <Money minor={m.kkdf} currency={c} /> },
              { label: t('rights.minExtra'), value: <Money minor={plan.extra_cost} currency={c} /> },
              ...(m.paid_off ? [] : [{ label: t('rights.minLeft'), value: <Money minor={m.balance_left} currency={c} /> }]),
            ]}
          />
        </div>
        <div>
          <h3 className="text-meta font-semibold text-ink">{t('rights.minRates')}</h3>
          <KeyValue
            className="mt-2"
            items={[
              ...plan.rates.contractual_monthly.map((r) => ({
                label: plan.rates.contractual_monthly.length > 1 ? t('rights.rateContractualFrom', { cycle: r.from_cycle }) : t('rights.rateContractual'),
                value: <RateValue value={pct(r.monthly, true)} source={source(r.source)} detail={r.detail} />,
              })),
              { label: 'BSMV', value: <RateValue value={pct(plan.rates.bsmv.value, false)} source={source(plan.rates.bsmv.source)} detail={plan.rates.bsmv.detail} /> },
              { label: 'KKDF', value: <RateValue value={pct(plan.rates.kkdf.value, false)} source={source(plan.rates.kkdf.source)} detail={plan.rates.kkdf.detail} /> },
              {
                label: t('rights.rateMinimum'),
                value: (
                  <RateValue
                    value={pct(plan.rates.minimum_ratio.value, false)}
                    source={source(plan.rates.minimum_ratio.source)}
                    detail={plan.rates.minimum_ratio.detail}
                  />
                ),
              },
            ]}
          />
          <p className="mt-3 text-meta text-muted">
            {t('rights.ratesChange')}{' '}
            <Link to="/settings" className="underline decoration-1 underline-offset-4 hover:decoration-transparent">
              {t('rights.toSettings')}
            </Link>
          </p>
        </div>
      </div>

      {plan.assumptions.length ? (
        <div>
          <h3 className="text-meta font-semibold text-ink">{t('rights.assumptions')}</h3>
          <ul className="mt-2 border-t border-ink">
            {plan.assumptions.map((a) => (
              <li key={a.key} className="border-b border-line py-2.5 text-meta text-ink">
                {KNOWN_ASSUMPTIONS.has(a.key) ? t(`rights.assume_${a.key}`) : a.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {plan.cycles.length ? (
        <div className="rounded-card bg-paper py-2">
          <Table caption={t('rights.cyclesCaption')}>
            <THead>
              <Tr>
                <Th>{t('rights.colCutOff')}</Th>
                <Th numeric>{t('rights.colBalance')}</Th>
                <Th numeric>{t('rights.colPayment')}</Th>
                <Th numeric>{t('rights.colInterest')}</Th>
                <Th numeric>BSMV</Th>
                <Th numeric>KKDF</Th>
                {plan.cycles.some((cy) => cy.added) ? <Th numeric>{t('rights.colAdded')}</Th> : null}
                <Th numeric>{t('rights.colNext')}</Th>
              </Tr>
            </THead>
            <TBody>
              {rows.map((cy) => (
                <Tr key={cy.cycle}>
                  <Td>{formatDate(cy.cut_off, locale)}</Td>
                  <Td numeric>
                    <Money minor={cy.balance} currency={c} />
                  </Td>
                  <Td numeric>
                    <Money minor={cy.payment} currency={c} />
                  </Td>
                  <Td numeric>
                    <Money minor={cy.interest} currency={c} />
                  </Td>
                  <Td numeric>
                    <Money minor={cy.bsmv} currency={c} />
                  </Td>
                  <Td numeric>
                    <Money minor={cy.kkdf} currency={c} />
                  </Td>
                  {plan.cycles.some((x) => x.added) ? (
                    <Td numeric>
                      <Money minor={cy.added} currency={c} />
                    </Td>
                  ) : null}
                  <Td numeric>
                    <Money minor={cy.next_balance} currency={c} />
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          {plan.cycles.length > FIRST_ROWS ? (
            <div className="px-6 pt-3 pb-2">
              <Button variant="ghost" size="sm" onClick={() => setAll((v) => !v)}>
                {all ? t('rights.cyclesLess') : t('rights.cyclesAll', { count: plan.cycles.length })}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function RateValue({ value, source, detail }: { value: string; source: string; detail: string | null }) {
  return (
    <span>
      {value}
      <span className="ml-2 font-normal text-muted">{source}</span>
      {detail ? <span className="mt-0.5 block font-normal text-muted">{detail}</span> : null}
    </span>
  );
}
