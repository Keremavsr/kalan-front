import { useTranslation } from 'react-i18next';
import { ApiError } from '../../api/types';

/**
 * Words for a failed request. `byCode` holds the screen's own sentences per error code; a back end that
 * does not answer (code `network`) gets the shared sentence; anything else falls back to `fallback`.
 */
export function useErrorText() {
  const { t } = useTranslation();
  return (error: unknown, fallback: string, byCode: Record<string, string> = {}) => {
    if (error instanceof ApiError) {
      if (byCode[error.code]) return byCode[error.code]!;
      if (error.code === 'network') return t('common.loadError');
    }
    return fallback;
  };
}
