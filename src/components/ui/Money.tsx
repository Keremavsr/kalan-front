import { formatMoney, type MoneyOptions } from '../../lib/format';
import { useIntlLocale } from '../../lib/useLocale';
import { cx } from '../../lib/cx';

export interface MoneyProps extends MoneyOptions {
  minor: number;
  currency: string;
  className?: string;
}

/** Formats integer minor units for the active locale. Every amount on screen goes through here. Figures are tabular app-wide. */
export function Money({ minor, currency, className, ...options }: MoneyProps) {
  const locale = useIntlLocale();
  return <span className={cx('whitespace-nowrap', className)}>{formatMoney(minor, currency, locale, options)}</span>;
}

/** For sentences: returns a formatter bound to the active locale. */
export function useMoneyFormatter() {
  const locale = useIntlLocale();
  return (minor: number, currency: string, options?: MoneyOptions) => formatMoney(minor, currency, locale, options);
}
