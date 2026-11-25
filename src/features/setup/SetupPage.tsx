import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useProviders, useSelectProvider, useSettings, useUpdateSettings } from '../../api/queries';
import type { Locale, Provider, Settings } from '../../api/types';
import { Card, Notice, PageHeader, QueryState, Segmented, useToast } from '../../components/ui';
import { INTL_LOCALE } from '../../i18n';
import { formatDate, formatMoney } from '../../lib/format';
import { cx } from '../../lib/cx';

export function SetupPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t('setup.title')} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-6">
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
    select.mutate(p.id, { onSuccess: () => toast.show(t('setup.saved', { name: p.name }), 'positive') });
  }

  return (
    <Card title={t('setup.providerTitle')} description={t('setup.providerIntro')} flush>
      <QueryState query={providers}>
        {() => (
          <fieldset className="px-5 pb-5">
            <legend className="sr-only">{t('setup.providerTitle')}</legend>
            <div className="divide-y divide-line overflow-hidden rounded-md border border-line">
              {providers.data?.providers.map((p) => {
                // Show the choice at once; the back end confirms it a moment later.
                const checked = p.id === (pendingId ?? providers.data?.selected);
                return (
                  <label
                    key={p.id}
                    className={cx(
                      'flex items-center gap-3 px-4 py-3 transition-colors duration-(--duration-fast)',
                      p.available ? 'cursor-pointer hover:bg-sunken' : 'cursor-not-allowed',
                      checked && 'bg-sunken',
                    )}
                  >
                    <input
                      type="radio"
                      name="provider"
                      value={p.id}
                      checked={checked}
                      disabled={!p.available}
                      onChange={() => choose(p)}
                      className="size-4 accent-accent"
                    />
                    <span className="min-w-0 flex-1">
                      <span className={cx('block text-sm font-medium', p.available ? 'text-ink' : 'text-ink-muted')}>
                        {p.name}
                      </span>
                      <span className="block font-mono text-xs text-ink-muted">{p.detail}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 text-xs">
                      {p.available ? (
                        <>
                          <Check aria-hidden className="size-3.5 text-positive" />
                          <span className="text-ink">{t('setup.found')}</span>
                        </>
                      ) : (
                        <span className="text-ink-muted">{t('setup.notFound')}</span>
                      )}
                    </span>
                    {pendingId === p.id ? <span className="sr-only">{t('common.loading')}</span> : null}
                  </label>
                );
              })}
            </div>
            {select.isError ? (
              <Notice tone="negative" role="alert" className="mt-3">
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
        void i18n.changeLanguage(saved.locale).then(() => toast.show(i18n.t('setup.settingsSaved'), 'positive'));
      },
    });
  }

  const current = settings.data;
  const lang = (i18n.resolvedLanguage ?? 'tr') as Locale;
  const intl = INTL_LOCALE[lang] ?? 'tr-TR';

  return (
    <Card title={t('setup.localeTitle')}>
      <QueryState query={settings}>
        {() =>
          current ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm font-medium text-ink">
                  {t('setup.locale')}
                </span>
                <Segmented<Locale>
                  label={t('setup.locale')}
                  value={current.locale}
                  onChange={(locale) => save({ ...current, locale })}
                  options={[
                    { value: 'tr', label: t('setup.localeTr') },
                    { value: 'en', label: t('setup.localeEn') },
                  ]}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm font-medium text-ink">{t('setup.monthsAhead')}</span>
                <Segmented<'6' | '12'>
                  label={t('setup.monthsAhead')}
                  value={current.months_ahead === 6 ? '6' : '12'}
                  onChange={(v) => save({ ...current, months_ahead: Number(v) })}
                  options={[
                    { value: '6', label: t('calendar.rangeMonths', { count: 6 }) },
                    { value: '12', label: t('calendar.rangeMonths', { count: 12 }) },
                  ]}
                />
              </div>
              <p className="border-t border-line pt-4 text-sm text-ink-muted">
                {t('setup.example', {
                  amount: formatMoney(114950, current.base_currency, intl),
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

function PrivacySection() {
  const { t } = useTranslation();
  const points = ['privacy1', 'privacy2', 'privacy3', 'privacy4', 'privacy5'] as const;
  return (
    <Card title={t('setup.privacyTitle')} className="self-start">
      <ol className="space-y-3 text-sm leading-relaxed text-ink">
        {points.map((key, i) => (
          <li key={key} className="flex gap-3">
            <span aria-hidden className="w-4 shrink-0 font-mono text-xs leading-6 text-ink-muted">
              {i + 1}
            </span>
            <span>{t(`setup.${key}`)}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
