import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useProviders, useSelectProvider, useSettings, useUpdateSettings } from '../../api/queries';
import type { Locale, Provider, Settings } from '../../api/types';
import { Card, Notice, PageHeader, QueryState, Segmented, useToast } from '../../components/ui';
import { INTL_LOCALE } from '../../i18n';
import { formatDate, formatMoney } from '../../lib/format';
import { cx } from '../../lib/cx';

/** The invented example amount shown everywhere: 1.234,56 / 1,234.56. */
const EXAMPLE_MINOR = 123456;

export function SettingsPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t('settings.title')} />
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start">
        <div className="grid grid-cols-1 gap-8">
          <ProviderSection />
          <LocaleSection />
        </div>
        <PrivacySection />
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
      <QueryState query={providers}>
        {() => (
          <fieldset className="px-6 pb-4">
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
                {select.error.message}
              </Notice>
            ) : null}
          </fieldset>
        )}
      </QueryState>
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
  const lang = (i18n.resolvedLanguage ?? 'tr') as Locale;
  const intl = INTL_LOCALE[lang] ?? 'tr-TR';

  return (
    <Card title={t('settings.localeTitle')}>
      <QueryState query={settings}>
        {() =>
          current ? (
            <div className="grid grid-cols-1 gap-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="font-semibold text-ink">{t('settings.locale')}</span>
                <Segmented<Locale>
                  label={t('settings.locale')}
                  value={current.locale}
                  onChange={(locale) => save({ ...current, locale })}
                  options={[
                    { value: 'tr', label: t('settings.localeTr') },
                    { value: 'en', label: t('settings.localeEn') },
                  ]}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="font-semibold text-ink">{t('settings.monthsAhead')}</span>
                <Segmented<'6' | '12'>
                  label={t('settings.monthsAhead')}
                  value={current.months_ahead === 6 ? '6' : '12'}
                  onChange={(v) => save({ ...current, months_ahead: Number(v) })}
                  options={[
                    { value: '6', label: t('installments.rangeMonths', { count: 6 }) },
                    { value: '12', label: t('installments.rangeMonths', { count: 12 }) },
                  ]}
                />
              </div>
              <p className="border-t border-line pt-4 text-meta text-muted">
                {t('settings.example', {
                  amount: formatMoney(EXAMPLE_MINOR, current.base_currency, intl),
                  date: formatDate('2026-11-04', intl, 'long'),
                })}
              </p>
            </div>
          ) : null
        }
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
