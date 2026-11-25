import { useState, type FormEvent } from 'react';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  useForgetPdfPassword,
  useInsightRules,
  usePdfPasswords,
  useProviders,
  useSelectProvider,
  useSettings,
  useUpdateInsightRules,
  useUpdateSettings,
} from '../../api/queries';
import type { Locale, Provider, RuleOverrides, Settings } from '../../api/types';
import { Button, Card, List, ListRow, Notice, PageHeader, QueryState, Segmented, TextField, useToast } from '../../components/ui';
import { SourceText } from '../../components/ui/ExternalLink';
import { INTL_LOCALE } from '../../i18n';
import { LANGUAGES, type Language } from '../../i18n/resources';
import { bankName } from '../../lib/banks';
import { formatDate, formatMoney } from '../../lib/format';
import { useIntlLocale } from '../../lib/useLocale';
import { cx } from '../../lib/cx';
import { OVERRIDE_KEYS, fromField, isRate, ruleDefaults, toField, type OverrideKey } from './rules';

/** The invented example amount shown everywhere: 1.234,56 / 1,234.56. */
const EXAMPLE_MINOR = 123456;
const MONTH_CHOICES = [3, 6, 12, 24];
/** Each language in its own name, so a reader who does not know the current one can still find theirs. */
const LANGUAGE_NAMES: Record<Language, string> = { tr: 'Türkçe', en: 'English', es: 'Español', pt: 'Português' };

export function SettingsPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t('settings.title')} />
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start">
        <div className="grid grid-cols-1 gap-8">
          <ProviderSection />
          <LocaleSection />
          <RatesSection />
        </div>
        <div className="grid grid-cols-1 gap-8">
          <PasswordsSection />
          <PrivacySection />
        </div>
      </div>
    </>
  );
}

function ProviderSection() {
  const { t } = useTranslation();
  const toast = useToast();
  const providers = useProviders();
  const select = useSelectProvider();
  const pendingId = select.isPending ? select.variables : null;

  function choose(p: Provider) {
    if (!p.available || p.id === providers.data?.selected) return;
    select.mutate(p.id, { onSuccess: () => toast.show(t('settings.saved', { name: p.name }), 'positive') });
  }

  return (
    <Card title={t('settings.providerTitle')} description={t('settings.providerIntro')} flush>
      <div className="px-6 pb-4">
        <QueryState query={providers}>
          {() => (
            <fieldset>
              <legend className="sr-only">{t('settings.providerTitle')}</legend>
              <div className="divide-y divide-line">
                {providers.data?.providers.map((p) => {
                  // Show the choice at once; the back end confirms it a moment later.
                  const checked = p.id === (pendingId ?? providers.data?.selected);
                  return (
                    <label
                      key={p.id}
                      className={cx(
                        '-mx-3 flex items-center gap-4 rounded-card px-3 py-3.5 transition-colors duration-(--duration-1)',
                        p.available ? 'cursor-pointer hover:bg-ground' : 'cursor-not-allowed',
                      )}
                    >
                      <input
                        type="radio"
                        name="provider"
                        value={p.id}
                        checked={checked}
                        disabled={!p.available}
                        onChange={() => choose(p)}
                        className="size-4 shrink-0 accent-ink"
                      />
                      <span className="min-w-0 flex-1">
                        <span className={cx('block font-semibold', p.available ? 'text-ink' : 'text-muted')}>{p.name}</span>
                        <span className="block text-meta text-muted">{p.detail}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5 text-meta">
                        {p.available ? (
                          <>
                            <Check aria-hidden className="size-3.5 text-ink" />
                            <span className="text-ink">{t('settings.found')}</span>
                          </>
                        ) : (
                          <span className="text-muted">{t('settings.notFound')}</span>
                        )}
                      </span>
                      {pendingId === p.id ? <span className="sr-only">{t('common.loading')}</span> : null}
                    </label>
                  );
                })}
              </div>
              {select.isError ? (
                <Notice tone="critical" role="alert" className="mt-3">
                  {select.error.code === 'provider_unavailable' ? t('settings.providerUnavailable') : select.error.message}
                </Notice>
              ) : null}
            </fieldset>
          )}
        </QueryState>
      </div>
    </Card>
  );
}

function LocaleSection() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const settings = useSettings();
  const update = useUpdateSettings();

  function save(next: Settings) {
    update.mutate(next, {
      onSuccess: (saved) => {
        void i18n.changeLanguage(saved.locale).then(() => toast.show(i18n.t('settings.settingsSaved'), 'positive'));
      },
    });
  }

  const current = settings.data;
  const lang = (i18n.resolvedLanguage ?? 'tr') as Language;
  const intl = INTL_LOCALE[lang] ?? 'tr-TR';
  const months = current ? [...new Set([...MONTH_CHOICES, current.months_ahead])].sort((a, b) => a - b) : MONTH_CHOICES;

  return (
    <Card title={t('settings.localeTitle')}>
      <QueryState query={settings}>
        {() =>
          current ? (
            <div className="grid grid-cols-1 gap-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="font-semibold text-ink">{t('settings.locale')}</span>
                <Segmented<Language>
                  label={t('settings.locale')}
                  value={(LANGUAGES as readonly string[]).includes(current.locale) ? (current.locale as Language) : 'tr'}
                  // The back end accepts every language the interface has; the client type still says tr | en.
                  onChange={(locale) => save({ ...current, locale: locale as Locale })}
                  options={LANGUAGES.map((l) => ({ value: l, label: LANGUAGE_NAMES[l] }))}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="font-semibold text-ink">{t('settings.monthsAhead')}</span>
                <Segmented<string>
                  label={t('settings.monthsAhead')}
                  value={String(current.months_ahead)}
                  onChange={(v) => save({ ...current, months_ahead: Number(v) })}
                  options={months.map((m) => ({ value: String(m), label: t('settings.months', { count: m }) }))}
                />
              </div>
              <p className="border-t border-line pt-4 text-meta text-muted">
                {t('settings.example', {
                  amount: formatMoney(EXAMPLE_MINOR, current.base_currency, intl),
                  date: formatDate('2026-11-04', intl, 'long'),
                })}
              </p>
              {update.isError ? (
                <Notice tone="critical" role="alert" className="px-0">
                  {update.error.code === 'network' ? t('settings.errNetwork') : t('settings.errSave', { message: update.error.message })}
                </Notice>
              ) : null}
            </div>
          ) : null
        }
      </QueryState>
    </Card>
  );
}

/** Rate overrides over the dated rules file: the file's value and source on each row, the user's value in the field. */
function RatesSection() {
  const { t } = useTranslation();
  const rules = useInsightRules();
  return (
    <Card title={t('settings.ratesTitle')} description={t('settings.ratesIntro')}>
      <QueryState query={rules}>
        {() => (rules.data ? <RatesForm rules={rules.data.rules} overrides={rules.data.overrides} /> : null)}
      </QueryState>
    </Card>
  );
}

function RatesForm({ rules, overrides }: { rules: Record<string, unknown>; overrides: RuleOverrides }) {
  const { t } = useTranslation();
  const toast = useToast();
  const locale = useIntlLocale();
  const update = useUpdateInsightRules();
  const decimal = (1.5).toLocaleString(locale).charAt(1);
  const initial = () => Object.fromEntries(OVERRIDE_KEYS.map((k) => [k, toField(k, overrides[k], decimal)])) as Record<OverrideKey, string>;
  const [values, setValues] = useState<Record<OverrideKey, string>>(initial);
  const [invalid, setInvalid] = useState<OverrideKey[]>([]);
  const defaults = ruleDefaults(rules, new Date().toISOString().slice(0, 10));
  const checkedOn = typeof rules.checked_on === 'string' ? rules.checked_on : null;
  const anySet = OVERRIDE_KEYS.some((k) => overrides[k] !== null);
  const pct = (v: string, key: OverrideKey) =>
    new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 2 }).format(isRate(key) ? Number(v) / 100 : Number(v));

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = OVERRIDE_KEYS.map((k) => [k, fromField(k, values[k])] as const);
    const bad = parsed.filter(([, v]) => v === undefined).map(([k]) => k);
    setInvalid(bad);
    if (bad.length) return;
    const body = Object.fromEntries(parsed.filter(([, v]) => v !== null)) as Partial<RuleOverrides>;
    update.mutate(body, { onSuccess: () => toast.show(t('settings.ratesSaved'), 'positive') });
  }

  function reset() {
    update.mutate(
      {},
      {
        onSuccess: () => {
          setValues(Object.fromEntries(OVERRIDE_KEYS.map((k) => [k, ''])) as Record<OverrideKey, string>);
          setInvalid([]);
          toast.show(t('settings.ratesReset'), 'positive');
        },
      },
    );
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-5">
      <ul className="border-t-2 border-ink">
        {OVERRIDE_KEYS.map((key) => {
          const d = defaults[key];
          const own = overrides[key] !== null;
          return (
            <li key={key} className="grid grid-cols-1 gap-x-6 gap-y-3 border-b border-line py-4 md:grid-cols-[minmax(0,1fr)_12rem] md:items-start">
              <div className="min-w-0">
                <p className="font-semibold text-ink">{t(`settings.rate_${key}`)}</p>
                <p className="mt-1 text-meta text-ink">
                  {d.values.length
                    ? t(d.values.length > 1 ? 'settings.ratesFileTiers' : 'settings.ratesFile', {
                        value: d.values.map((v) => pct(v, key)).join(' / '),
                      })
                    : t('settings.ratesFileNone')}
                  {own ? <span className="font-semibold"> · {t('settings.ratesOwn')}</span> : null}
                </p>
                <p className="mt-0.5 text-meta text-muted">
                  {t('settings.ratesSource')}: {d.source ? <SourceText source={d.source} /> : t('settings.ratesSourceFile', { date: checkedOn ? formatDate(checkedOn, locale) : '–' })}
                </p>
              </div>
              <TextField
                label={t('settings.ratesYours', { name: t(`settings.rate_${key}`) })}
                labelHidden
                inputMode="decimal"
                placeholder={t('settings.ratesPlaceholder')}
                value={values[key]}
                onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                error={invalid.includes(key) ? t(isRate(key) ? 'settings.ratesInvalidRate' : 'settings.ratesInvalidShare') : undefined}
                hint={t(isRate(key) ? 'settings.ratesUnitRate' : 'settings.ratesUnitShare')}
              />
            </li>
          );
        })}
      </ul>
      <p className="max-w-measure text-meta text-muted">{t('settings.ratesWhere')}</p>
      {update.isError ? (
        <Notice tone="critical" role="alert" className="px-0">
          {update.error.code === 'validation_error' ? t('settings.ratesRejected') : update.error.code === 'network' ? t('settings.errNetwork') : t('settings.errSave', { message: update.error.message })}
        </Notice>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="go" loading={update.isPending && Object.keys(update.variables ?? {}).length > 0}>
          {t('settings.ratesSave')}
        </Button>
        <Button variant="secondary" disabled={!anySet || update.isPending} onClick={reset}>
          {t('settings.ratesDefault')}
        </Button>
      </div>
    </form>
  );
}

/** Banks whose PDF password sits in the OS keyring. Never the password itself. */
function PasswordsSection() {
  const { t } = useTranslation();
  const toast = useToast();
  const passwords = usePdfPasswords();
  const forget = useForgetPdfPassword();

  return (
    <Card title={t('settings.passwordsTitle')} description={t('settings.passwordsIntro')}>
      <QueryState query={passwords}>
        {() => {
          const data = passwords.data;
          if (!data) return null;
          if (!data.keyring) return <p className="text-body text-ink">{t('settings.passwordsNoKeyring')}</p>;
          return (
            <>
              <List label={t('settings.passwordsTitle')}>
                {data.items.map((item) => (
                  <ListRow
                    key={item.bank}
                    narrowMeta
                    className="py-4"
                    title={<span className="text-body">{bankName(item.bank)}</span>}
                    detail={item.hint ? <span className="text-meta text-muted">{t('settings.passwordsHint', { hint: item.hint })}</span> : null}
                    aside={
                      item.remembered ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={forget.isPending && forget.variables === item.bank}
                          onClick={() =>
                            forget.mutate(item.bank, { onSuccess: () => toast.show(t('settings.passwordsForgotten', { bank: bankName(item.bank) }), 'positive') })
                          }
                          aria-label={t('settings.passwordsForgetLabel', { bank: bankName(item.bank) })}
                        >
                          {t('settings.passwordsForget')}
                        </Button>
                      ) : (
                        <span className="text-muted">{t('settings.passwordsNone')}</span>
                      )
                    }
                  />
                ))}
              </List>
              {forget.isError ? (
                <Notice tone="critical" role="alert" className="mt-3 px-0">
                  {forget.error.code === 'not_remembered' ? t('settings.passwordsGone') : t('settings.errSave', { message: forget.error.message })}
                </Notice>
              ) : null}
            </>
          );
        }}
      </QueryState>
    </Card>
  );
}

/** Numbered like the issue list of the site: a bold number, then the sentence. */
function PrivacySection() {
  const { t } = useTranslation();
  const points = ['privacy1', 'privacy2', 'privacy3', 'privacy4', 'privacy5'] as const;
  return (
    <Card title={t('settings.privacyTitle')}>
      <ol className="divide-y divide-line">
        {points.map((key, i) => (
          <li key={key} className="grid grid-cols-[2rem_minmax(0,1fr)] py-3.5 first:pt-0 last:pb-0">
            <span aria-hidden className="text-lead leading-snug font-bold text-ink">
              {i + 1}.
            </span>
            <span className="text-body text-ink">{t(`settings.${key}`)}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
