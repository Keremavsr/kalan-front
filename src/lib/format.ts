// Locale-aware formatting through Intl. Money arrives as integer minor units.

/** No-break space, so an amount and its currency never wrap apart. */
export const NBSP = String.fromCharCode(0xa0);

const fractionDigitsCache = new Map<string, number>();

function fractionDigits(currency: string): number {
  let digits = fractionDigitsCache.get(currency);
  if (digits === undefined) {
    digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
    fractionDigitsCache.set(currency, digits);
  }
  return digits;
}

export function minorToMajor(minor: number, currency: string): number {
  return minor / 10 ** fractionDigits(currency);
}

/**
 * Local conventions Intl does not produce on its own. In Turkish, amounts in
 * lira are written "1.234,56 TL": number first, then the abbreviation.
 */
const SUFFIX_CODES: Record<string, Record<string, string>> = {
  tr: { TRY: 'TL' },
};

export interface MoneyOptions {
  /** Show a leading sign for positive values too (for changes). */
  signDisplay?: 'auto' | 'always' | 'exceptZero';
  /** Drop the currency label (for dense tables with a currency in the header). */
  bare?: boolean;
}

export function formatMoney(minor: number, currency: string, locale: string, options: MoneyOptions = {}): string {
  const lang = locale.split('-')[0] ?? locale;
  const digits = fractionDigits(currency);
  const value = minorToMajor(minor, currency);
  const suffix = SUFFIX_CODES[lang]?.[currency];
  const signDisplay = options.signDisplay ?? 'auto';

  if (options.bare || suffix) {
    const number = new Intl.NumberFormat(locale, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      signDisplay,
    }).format(value);
    return options.bare ? number : `${number}${NBSP}${suffix}`;
  }
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
    signDisplay,
  })
    .format(value)
    .replace(/\s/g, NBSP);
}

export function formatPercent(ratio: string | number, locale: string, options: { signDisplay?: 'auto' | 'exceptZero' } = {}): string {
  const value = typeof ratio === 'string' ? Number(ratio) : ratio;
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: 1,
    signDisplay: options.signDisplay ?? 'auto',
  }).format(value);
}

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d ?? 1));
}

export function formatDate(iso: string, locale: string, style: 'short' | 'long' = 'short'): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: style === 'short' ? 'short' : 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parseIsoDate(iso));
}

export function formatDayMonth(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(parseIsoDate(iso));
}

export function formatMonth(month: string, locale: string, style: 'short' | 'long' = 'long'): string {
  return new Intl.DateTimeFormat(locale, {
    month: style,
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parseIsoDate(`${month}-01`));
}

export function formatMonthName(month: string, locale: string, style: 'short' | 'long' = 'short'): string {
  return new Intl.DateTimeFormat(locale, { month: style, timeZone: 'UTC' }).format(parseIsoDate(`${month}-01`));
}

export function formatDateTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

/** Parse a user-typed amount ("1.149,50", "1149.5", "1 149,50") into minor units. Returns null if invalid. */
export function parseAmountToMinor(input: string, locale: string, currency: string): number | null {
  const lang = locale.split('-')[0];
  let text = input.trim().replace(/\s/g, '').split(NBSP).join('');
  if (!text) return null;
  const decimalComma = lang === 'tr' || lang === 'pt' || lang === 'es';
  if (decimalComma) text = text.replace(/\./g, '').replace(',', '.');
  else text = text.replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const minor = Math.round(Number(text) * 10 ** fractionDigits(currency));
  return minor > 0 ? minor : null;
}

/**
 * Folds text for search so that Turkish case rules do not hide matches:
 * "MIGROS" lowercases to "mıgros" in Turkish, and users type "migros".
 */
export function foldForSearch(value: string, locale: string): string {
  return value
    .toLocaleLowerCase(locale)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ı/g, 'i');
}
