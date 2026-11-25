import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProviders, useSuggestions } from '../../api/queries';
import type { Suggestion } from '../../api/types';
import { PencilLink } from '../../components/pencil';
import { Button, List, ListRow, Notice, Rich, useMoneyFormatter } from '../../components/ui';
import { TextButton } from '../../components/ui/TextButton';
import { formatMonth } from '../../lib/format';
import { useIntlLocale } from '../../lib/useLocale';
import { useCategoryName } from '../spending/categoryName';

const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
const list = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

/** Where a suggestion's link goes, named like the menu. */
const AREAS = ['recurring', 'installments', 'rights', 'statements', 'spending', 'settings'] as const;
type Area = (typeof AREAS)[number];

function areaOf(link: string | null): Area | null {
  const first = link?.split(/[/?#]/)[1] ?? '';
  return (AREAS as readonly string[]).includes(first) ? (first as Area) : null;
}

/**
 * The words of a suggestion. Rule suggestions are written here from `kind` and `params`, so every language reads
 * the same; when a param this side needs is missing, the back end's own title and body are used (tr or en).
 */
// eslint-disable-next-line react-refresh/only-export-components -- the hook belongs with the list that uses it
export function useSuggestionText() {
  const { t } = useTranslation();
  const fmt = useMoneyFormatter();
  const locale = useIntlLocale();
  const category = useCategoryName();

  return (s: Suggestion): { title: string; body: string; rich: boolean; values: Record<string, string> } => {
    const p = s.params ?? {};
    const c = s.currency;
    const money = (v: unknown) => (Number.isFinite(num(v)) ? fmt(num(v), c) : null);
    const own = { title: s.title, body: s.body, rich: false, values: {} };
    const base = `overview.suggestions.kind.${s.kind}`;
    const write = (values: Record<string, string | null>, titleValues: Record<string, string> = {}) => {
      if (Object.values(values).some((v) => v === null || v === '')) return own;
      const clean = values as Record<string, string>;
      return { title: t(`${base}.title`, { ...clean, ...titleValues }), body: `${base}.body`, rich: true, values: clean };
    };
    switch (s.kind) {
      case 'price_rise':
        return write({ merchant: str(p.merchant), previous: money(p.amount_previous), last: money(p.amount_last) });
      case 'duplicate_service': {
        const names = list(p.merchants);
        return write({
          merchants: names.length ? new Intl.ListFormat(locale, { type: 'conjunction' }).format(names) : null,
          count: names.length ? String(names.length) : null,
          saving: money(s.monthly_saving),
        });
      }
      case 'card_fee':
        return write({ card: s.card_label ?? str(p.card), amount: money(p.amount ?? s.yearly_saving) });
      case 'interest':
        return write({
          card: s.card_label ?? str(p.card),
          month: str(p.month) ? formatMonth(str(p.month), locale) : null,
          amount: money(p.amount ?? s.monthly_saving),
        });
      case 'foreign_currency':
        return write({ amount: money(p.monthly_average) });
      case 'frequent_place':
        return write({
          merchant: str(p.merchant),
          amount: money(p.monthly_average),
          category: p.category ? category(str(p.category)) : category(null),
          yearly: money(s.yearly_saving),
        });
      case 'installment_relief':
        return write({ month: str(p.month) ? formatMonth(str(p.month), locale) : null, amount: money(p.amount) });
      default:
        return own;
    }
  };
}

/**
 * Savings suggestions, most saving first as the back end sorts them. Each one says what to do; a saving is shown
 * only when the back end computed it (AI suggestions never carry one).
 */
export function SuggestionsBody({ limit = 4 }: { limit?: number }) {
  const { t, i18n } = useTranslation();
  const suggestions = useSuggestions(i18n.resolvedLanguage ?? 'tr');
  const providers = useProviders();
  const text = useSuggestionText();
  const fmt = useMoneyFormatter();
  const [all, setAll] = useState(false);
  const hasProvider = Boolean(providers.data?.selected);

  if (suggestions.isPending) return <p className="text-body text-muted" role="status">{t('common.loading')}</p>;
  if (suggestions.isError)
    return (
      <Notice
        tone="warning"
        title={t('overview.suggestions.loadError')}
        actions={
          <Button variant="secondary" size="sm" onClick={() => void suggestions.refetch()}>
            {t('common.retry')}
          </Button>
        }
      />
    );

  const items = suggestions.data.items;
  const shown = all ? items : items.slice(0, limit);
  const rest = items.length - limit;

  return (
    <div className="grid gap-4">
      {items.length ? (
        <List label={t('overview.suggestions.title')}>
          {shown.map((s) => {
            const words = text(s);
            const area = areaOf(s.link);
            return (
              <ListRow
                key={s.id}
                meta={
                  <span className="grid gap-0.5">
                    {s.card_label ? <span>{s.card_label}</span> : null}
                    {s.source === 'ai' ? <span className="text-muted">{t('overview.suggestions.fromAi')}</span> : null}
                  </span>
                }
                title={words.title}
                detail={words.rich ? <Rich i18nKey={words.body} values={words.values} /> : words.body}
                aside={
                  <span className="grid justify-items-end gap-1.5">
                    {s.monthly_saving ? (
                      <span className="text-body">
                        <Rich i18nKey="overview.suggestions.saving" values={{ amount: fmt(s.monthly_saving, s.currency) }} />
                      </span>
                    ) : null}
                    {s.link && area ? (
                      <PencilLink to={s.link} seed={`${s.id}-go`} className="font-semibold">
                        {area === 'settings' ? t('nav.settings') : t(`overview.alerts.go.${area}`)}
                      </PencilLink>
                    ) : null}
                  </span>
                }
              />
            );
          })}
        </List>
      ) : (
        <p className="text-body text-ink">{t('overview.suggestions.none')}</p>
      )}
      {rest > 0 ? (
        <TextButton className="justify-self-start text-meta" onClick={() => setAll((v) => !v)} aria-expanded={all}>
          {all ? t('overview.suggestions.less') : t('overview.suggestions.more', { count: rest })}
        </TextButton>
      ) : null}
      {!hasProvider && providers.isSuccess ? (
        <p className="max-w-measure text-meta text-muted">{t('overview.suggestions.aiHint')}</p>
      ) : null}
    </div>
  );
}
