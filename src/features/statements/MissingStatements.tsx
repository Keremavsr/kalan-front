import { useTranslation } from 'react-i18next';
import { useAlerts } from '../../api/queries';
import type { Alert } from '../../api/types';
import { formatMonth } from '../../lib/format';
import { useIntlLocale } from '../../lib/useLocale';

const str = (v: unknown) => (typeof v === 'string' ? v : '');

/**
 * Missing statements, card by card, in plain sentences at the top of Ekstreler: which months the bank has but kalan
 * does not, and what to do about it. The gaps come from the back end's `missing_statement` alerts.
 */
export function MissingStatements() {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const alerts = useAlerts();
  const missing = (alerts.data?.items ?? []).filter((a) => a.kind === 'missing_statement');
  if (!missing.length) return null;

  const sentence = (a: Alert) => {
    const from = str(a.params.from) || a.month;
    const to = str(a.params.to) || from;
    const count = Number(a.params.months ?? 1) || 1;
    const range = from === to ? formatMonth(from, locale) : `${formatMonth(from, locale)}–${formatMonth(to, locale)}`;
    const card = a.card_label ?? str(a.params.card);
    return t('statements.missing.row', { card, range, count });
  };

  return (
    <section aria-labelledby="missing-title" className="border-y border-ink py-5">
      <h2 id="missing-title" className="text-title font-bold text-ink">
        {t('statements.missing.title', { count: missing.length })}
      </h2>
      <ul className="mt-3 grid gap-1.5">
        {missing.map((a) => (
          <li key={a.id} className="text-body text-ink">
            {sentence(a)}
          </li>
        ))}
      </ul>
      <p className="mt-3 max-w-measure text-meta text-muted">{t('statements.missing.how')}</p>
    </section>
  );
}
