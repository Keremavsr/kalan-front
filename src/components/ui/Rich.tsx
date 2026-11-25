import { Trans } from 'react-i18next';

/**
 * Renders a translated sentence whose amounts are marked <m>...</m> in the
 * message. Pass amounts already formatted (see useMoneyFormatter).
 */
export function Rich({ i18nKey, values, count }: { i18nKey: string; values: Record<string, string | number>; count?: number }) {
  return (
    <Trans
      i18nKey={i18nKey}
      values={values}
      {...(count === undefined ? {} : { count })}
      components={{ m: <span className="tabular font-semibold whitespace-nowrap text-ink" /> }}
    />
  );
}
