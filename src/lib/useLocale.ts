import { useTranslation } from 'react-i18next';
import { INTL_LOCALE } from '../i18n';

/** The Intl locale tag for the active UI language. */
export function useIntlLocale(): string {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? i18n.language;
  return INTL_LOCALE[lang] ?? 'en-GB';
}
