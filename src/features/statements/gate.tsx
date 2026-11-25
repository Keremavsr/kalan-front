import { useTranslation } from 'react-i18next';
import type { GateIssue } from '../../api/types';
import { MarginMark } from '../../components/pencil';
import { useMoneyFormatter } from '../../components/ui';
import { formatDate } from '../../lib/format';
import { useIntlLocale } from '../../lib/useLocale';

const KNOWN = new Set([
  'duplicate_statement',
  'period_invalid',
  'due_before_cut_off',
  'no_transactions',
  'amount_scale',
  'period_unusual',
  'not_reconciled',
  'reconciliation_mismatch',
  'no_printed_summary',
  'rows_after_cut_off',
  'minimum_above_total',
  'installment_counter',
  'installment_sequence',
  'installment_missing',
]);

const count = (value: unknown) => (Array.isArray(value) ? value.length : typeof value === 'number' ? value : 0);
const str = (value: unknown) => (typeof value === 'string' ? value : '');

/** One save-gate finding in plain words, with the figures from `details`. Unknown codes keep the back end's text. */
export function useGateMessage(currency: string) {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const fmt = useMoneyFormatter();
  return (issue: GateIssue): string => {
    if (!KNOWN.has(issue.code)) return issue.message;
    const d = issue.details;
    const date = (v: unknown) => (str(v) ? formatDate(str(v), locale) : '');
    const values: Record<string, string | number> = {
      start: date(d.period_start),
      end: date(d.period_end),
      due: date(d.due_date),
      factor: typeof d.factor === 'number' ? d.factor : 10,
      days: typeof d.days === 'number' ? d.days : 0,
      difference: typeof d.difference === 'number' ? fmt(Math.abs(d.difference), currency) : '',
      count: count(d.count ?? d.transaction_ids ?? d.plan_ids),
    };
    return t(`statements.gate.${issue.code}`, { ...values, count: Number(values.count) });
  };
}

/**
 * Findings in the list layout: a hard finding (it blocks the save) carries the pencil margin mark and
 * the word; a soft one is a plain row to check.
 */
export function GateList({ issues, currency, label }: { issues: GateIssue[]; currency: string; label: string }) {
  const { t } = useTranslation();
  const message = useGateMessage(currency);
  const ordered = [...issues].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'hard' ? -1 : 1));
  return (
    <ul aria-label={label} className="mt-3 border-t border-ink">
      {ordered.map((issue, i) => (
        <li key={`${issue.code}-${i}`} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-2 border-b border-line py-3">
          <span aria-hidden className="pt-0.5">
            {issue.severity === 'hard' ? <MarginMark /> : null}
          </span>
          <p className="text-body text-ink">
            <span className="mr-2 font-bold">{issue.severity === 'hard' ? t('statements.gateHard') : t('statements.gateSoft')}</span>
            {message(issue)}
          </p>
        </li>
      ))}
    </ul>
  );
}
