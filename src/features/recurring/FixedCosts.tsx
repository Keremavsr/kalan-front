import { useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  useCategoryRules,
  useCreateFixedCost,
  useDeleteFixedCost,
  useFixedCostMatches,
  useFixedCosts,
  useSettings,
} from '../../api/queries';
import { isApiError, type FixedCost, type FixedCostMatches } from '../../api/types';
import {
  Button,
  List,
  ListRow,
  Modal,
  Money,
  Notice,
  Section,
  SelectField,
  TextField,
  useMoneyFormatter,
  useToast,
} from '../../components/ui';
import { DateField } from '../../components/ui/DateField';
import { SectionState } from '../../components/ui/SectionState';
import { useErrorText } from '../../components/ui/errorText';
import { Scribble } from '../../components/pencil';
import { formatDate, formatMonth, formatMonthName, formatPercent, parseAmountToMinor } from '../../lib/format';
import { useIntlLocale } from '../../lib/useLocale';
import { cx } from '../../lib/cx';
import { useCategoryName } from '../spending/categoryName';
import { thisMonth, yearsAround } from './dates';

type Report = FixedCostMatches['costs'][number];

/**
 * Fixed costs (rent, dues) and whether each month's payment was found among the stored rows.
 * Matching, tolerance and duplicates come from `/insights/fixed-costs/matches`; the screen only lays them out.
 */
export function FixedCosts() {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const costs = useFixedCosts();
  const matches = useFixedCostMatches();
  const [adding, setAdding] = useState(false);
  const items = costs.data?.items ?? [];
  const tolerance = matches.data?.tolerance;

  return (
    <Section
      id="fixed-costs"
      band
      title={t('recurring.fixed.title')}
      description={t('recurring.fixed.intro')}
      actions={
        <Button variant="primary" dot={<Plus className="size-4" />} onClick={() => setAdding(true)}>
          {t('recurring.fixed.add')}
        </Button>
      }
    >
      <SectionState query={costs} failed={t('recurring.fixed.failed')}>
        {() =>
          items.length ? (
            <div className="grid gap-5">
              {matches.isError ? (
                <Notice
                  tone="warning"
                  role="alert"
                  title={t('recurring.fixed.matchFailed')}
                  actions={
                    <Button variant="secondary" size="sm" onClick={() => void matches.refetch()}>
                      {t('common.retry')}
                    </Button>
                  }
                />
              ) : null}
              <Duplicates report={matches.data} costs={items} />
              <List label={t('recurring.fixed.title')}>
                {items.map((cost) => (
                  <CostRow
                    key={cost.id}
                    cost={cost}
                    report={matches.data?.costs.find((c) => c.fixed_cost_id === cost.id)}
                    matchesPending={matches.isPending}
                  />
                ))}
              </List>
              {tolerance ? (
                <p className="max-w-measure text-meta text-muted">
                  {t('recurring.fixed.tolerance', { percent: formatPercent(tolerance.amount, locale), days: tolerance.days })}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="max-w-measure border-t border-ink py-5 text-body text-ink">{t('recurring.fixed.empty')}</p>
          )
        }
      </SectionState>
      <AddFixedCost open={adding} onClose={() => setAdding(false)} />
    </Section>
  );
}

function Duplicates({ report, costs }: { report: FixedCostMatches | undefined; costs: FixedCost[] }) {
  const { t } = useTranslation();
  const fmt = useMoneyFormatter();
  if (!report?.duplicates.length) return null;
  const nameOf = (id: string) => costs.find((c) => c.id === id)?.name ?? id;
  return (
    <>
      {report.duplicates.map((d) => {
        const names = d.fixed_cost_ids.map(nameOf);
        const currency = costs.find((c) => c.id === d.fixed_cost_ids[0])?.currency ?? 'TRY';
        return (
          <Notice key={d.fixed_cost_ids.join('|')} tone="warning" title={t('recurring.fixed.duplicateTitle')}>
            {t(d.same_name ? 'recurring.fixed.duplicateSame' : 'recurring.fixed.duplicate', {
              a: names[0],
              b: names[1],
              amount: fmt(d.amount_diff, currency),
              count: d.day_gap,
            })}
          </Notice>
        );
      })}
    </>
  );
}

function CostRow({ cost, report, matchesPending }: { cost: FixedCost; report: Report | undefined; matchesPending: boolean }) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const toast = useToast();
  const name = useCategoryName();
  const errorText = useErrorText();
  const remove = useDeleteFixedCost();
  const [failed, setFailed] = useState<string | null>(null);

  const period = cost.end
    ? t('recurring.fixed.between', { start: formatMonth(cost.start, locale), end: formatMonth(cost.end, locale) })
    : t('recurring.fixed.since', { start: formatMonth(cost.start, locale) });

  function drop() {
    setFailed(null);
    remove.mutate(cost.id, {
      onSuccess: () => toast.show(t('recurring.fixed.deleted', { name: cost.name }), 'positive'),
      onError: (error) => {
        if (isApiError(error, 'fixed_cost_not_found')) {
          toast.show(t('recurring.fixed.gone'), 'neutral');
          return;
        }
        setFailed(errorText(error, t('recurring.fixed.deleteFailed')));
      },
    });
  }

  return (
    <ListRow
      meta={t('recurring.fixed.day', { day: cost.day })}
      title={cost.name}
      detail={
        <span className="text-meta text-muted">
          {period}
          {cost.category ? ` · ${name(cost.category)}` : ''}
        </span>
      }
      aside={
        <span className="grid justify-items-end gap-2">
          <Money minor={cost.amount} currency={cost.currency} className="text-lead font-bold" />
          <Button
            variant="secondary"
            size="sm"
            onClick={drop}
            loading={remove.isPending}
            aria-label={t('recurring.fixed.deleteFor', { name: cost.name })}
          >
            {t('recurring.fixed.delete')}
          </Button>
        </span>
      }
    >
      {matchesPending ? null : report ? <MonthStrip report={report} /> : null}
      {failed ? (
        <Notice tone="critical" role="alert" className="mt-3">
          {failed}
        </Notice>
      ) : null}
    </ListRow>
  );
}

/**
 * The months the back end checked, in order: a filled pill is a month with a matched payment, an outlined
 * pill a month with none (the symbol of kalan: paid slices full, the rest an outline). Missing months are
 * also written out, underlined by the pencil.
 */
function MonthStrip({ report }: { report: Report }) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const fmt = useMoneyFormatter();
  const months = [...new Set([...report.matches.map((m) => m.month), ...report.missing_months])].sort();
  if (!months.length) return <p className="mt-3 text-meta text-muted">{t('recurring.fixed.noMonths')}</p>;
  const missing = report.missing_months;
  const list = new Intl.ListFormat(locale, { type: 'conjunction' }).format(missing.map((m) => formatMonth(m, locale)));

  return (
    <div className="mt-3 grid gap-2.5">
      <ol className="flex flex-wrap gap-x-1.5 gap-y-2" aria-label={t('recurring.fixed.stripLabel', { name: report.name })}>
        {months.map((month) => {
          const match = report.matches.find((m) => m.month === month);
          return (
            <li key={month} className="grid w-12 justify-items-center gap-1">
              <span
                aria-hidden
                className={cx('block h-2.5 w-full rounded-pill border border-ink', match ? 'bg-ink' : 'bg-transparent')}
              />
              <span aria-hidden className="text-meta text-muted tabular-nums">
                {formatMonthName(month, locale)} {month.slice(2, 4)}
              </span>
              <span className="sr-only">
                {match
                  ? t('recurring.fixed.paidOn', {
                      month: formatMonth(month, locale),
                      date: formatDate(match.date, locale),
                      amount: fmt(match.amount, report.currency),
                    })
                  : t('recurring.fixed.missingIn', { month: formatMonth(month, locale) })}
              </span>
            </li>
          );
        })}
      </ol>
      {missing.length ? (
        <p className="text-meta text-ink">
          <span className="scribble-host relative font-semibold" data-marked="true">
            {t('recurring.fixed.missing', { count: missing.length })}
            <Scribble seed={report.fixed_cost_id} />
          </span>{' '}
          {list}
        </p>
      ) : (
        <p className="text-meta text-muted">{t('recurring.fixed.allPaid', { count: report.matches.length })}</p>
      )}
    </div>
  );
}

interface Errors {
  name?: string;
  amount?: string;
  end?: string;
}

function AddFixedCost({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const toast = useToast();
  const errorText = useErrorText();
  const categoryName = useCategoryName();
  const settings = useSettings();
  const rules = useCategoryRules();
  const create = useCreateFixedCost();
  const currency = settings.data?.base_currency ?? 'TRY';

  const [name, setName] = useState('');
  const [amountText, setAmountText] = useState('');
  const [day, setDay] = useState(1);
  const [start, setStart] = useState(thisMonth);
  const [end, setEnd] = useState('');
  const [category, setCategory] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const amount = parseAmountToMinor(amountText, locale, currency);
  const parts = { month: t('recurring.parts.month'), year: t('recurring.parts.year') };

  function close() {
    setName('');
    setAmountText('');
    setDay(1);
    setStart(thisMonth());
    setEnd('');
    setCategory('');
    setErrors({});
    create.reset();
    onClose();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const next: Errors = {};
    if (!name.trim()) next.name = t('recurring.fixed.required');
    if (!amountText.trim()) next.amount = t('recurring.fixed.required');
    else if (amount === null || amount <= 0) next.amount = t('recurring.fixed.amountInvalid');
    if (end && end < start) next.end = t('recurring.fixed.endBeforeStart');
    setErrors(next);
    if (Object.keys(next).length || amount === null) return;
    create.mutate(
      { name: name.trim(), amount, currency, day, start, end: end || null, category: category || null },
      {
        onSuccess: (cost) => {
          toast.show(t('recurring.fixed.added', { name: cost.name }), 'positive');
          close();
        },
      },
    );
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('recurring.fixed.addTitle')}
      description={t('recurring.fixed.addIntro')}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button variant="go" type="submit" form="fixed-cost" loading={create.isPending}>
            {t('recurring.fixed.save')}
          </Button>
        </>
      }
    >
      <form id="fixed-cost" noValidate onSubmit={submit} className="grid grid-cols-2 gap-4">
        <TextField
          label={t('recurring.fixed.name')}
          hint={t('recurring.fixed.nameHint')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          fieldClassName="col-span-2"
          autoComplete="off"
        />
        <TextField
          label={t('recurring.fixed.amount')}
          hint={t('recurring.fixed.amountHint')}
          inputMode="decimal"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
          error={errors.amount}
          className="text-right tabular-nums"
          autoComplete="off"
        />
        <SelectField
          label={t('recurring.fixed.dayLabel')}
          hint={t('recurring.fixed.dayHint')}
          value={String(day)}
          onChange={(e) => setDay(Number(e.target.value))}
          className="tabular-nums"
          options={Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))}
        />
        <DateField
          label={t('recurring.fixed.start')}
          locale={locale}
          mode="month"
          value={start}
          onChange={(v) => setStart(v || thisMonth())}
          years={yearsAround(-5, 2)}
          parts={parts}
          className="col-span-2"
        />
        <DateField
          label={t('recurring.fixed.end')}
          locale={locale}
          mode="month"
          optional
          emptyLabel={t('recurring.fixed.noEnd')}
          defaultYear={Number(start.slice(0, 4))}
          value={end}
          onChange={setEnd}
          years={yearsAround(-5, 6)}
          parts={parts}
          error={errors.end}
          className="col-span-2"
        />
        <SelectField
          label={t('recurring.fixed.category')}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          fieldClassName="col-span-2"
          options={[
            { value: '', label: t('recurring.fixed.noCategory') },
            ...(rules.data?.categories ?? []).map((c) => ({ value: c, label: categoryName(c) })),
          ]}
        />
        {create.isError ? (
          <Notice tone="critical" role="alert" className="col-span-2 -mx-5">
            {errorText(create.error, t('recurring.fixed.saveFailed'), {
              invalid_period: t('recurring.fixed.endBeforeStart'),
              validation_error: t('recurring.fixed.invalid'),
            })}
          </Notice>
        ) : null}
      </form>
    </Modal>
  );
}
