import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { LANGUAGES, resources } from './resources';

/** Locales the UI offers: every language with locale files. */
export const UI_LOCALES = LANGUAGES;
export type UiLocale = (typeof UI_LOCALES)[number];

/** BCP 47 tags used for Intl formatting. */
export const INTL_LOCALE: Record<string, string> = { tr: 'tr-TR', en: 'en-GB', pt: 'pt-BR', es: 'es-MX' };

export const STORAGE_KEY = 'kalan.locale';

function initialLanguage(): UiLocale {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    if ((UI_LOCALES as readonly string[]).includes(stored ?? '')) return stored as UiLocale;
  } catch {
    /* storage unavailable */
  }
  return 'tr';
}

void i18n.use(initReactI18next).init({
  resources: resources(),
  lng: initialLanguage(),
  fallbackLng: 'en',
  returnEmptyString: false,
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, lng);
  } catch {
    /* storage unavailable */
  }
});
document.documentElement.lang = i18n.language;

export default i18n;
