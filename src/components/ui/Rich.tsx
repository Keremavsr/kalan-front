import { Trans } from 'react-i18next';
import { Circled } from '../pencil';

/**
 * Renders a translated sentence. In the message, <m>...</m> marks an amount (semibold) and
 * <c>...</c> the one figure the screen is about, which the pencil rings. Use <c> once per screen.
 * Pass amounts already formatted (see useMoneyFormatter).
 */
export function Rich({ i18nKey, values, count }: { i18nKey: string; values: Record<string, string | number>; count?: number }) {
  return (
    <Trans
      i18nKey={i18nKey}
      values={values}
      {...(count === undefined ? {} : { count })}
      components={{ m: <span className="font-semibold whitespace-nowrap text-ink" />, c: <Circled /> }}
    />
  );
}
