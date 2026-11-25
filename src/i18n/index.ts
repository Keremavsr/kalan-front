import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import tr from './locales/tr.json';
import en from './locales/en.json';
import pt from './locales/pt.json';
import es from './locales/es.json';

/** Locales the UI offers today. pt and es have their key files ready but no text yet. */
export const UI_LOCALES = ['tr', 'en'] as const;
export type UiLocale = (typeof UI_LOCALES)[number];

/** BCP 47 tags used for Intl formatting. */
export const INTL_LOCALE: Record<string, string> = { tr: 'tr-TR', en: 'en-GB', pt: 'pt-BR', es: 'es-MX' };

export const STORAGE_KEY = 'kalan.locale';

function initialLanguage(): UiLocale {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (stored === 'tr' || stored === 'en') return stored;
  } catch {
    /* storage unavailable */
  }
  return 'tr';
}

void i18n.use(initReactI18next).init({
  resources: { tr: { translation: tr }, en: { translation: en }, pt: { translation: pt }, es: { translation: es } },
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
