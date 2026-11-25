import { useTranslation } from 'react-i18next';
import { PageHeader } from '../../components/ui';
import { CardFeesSection } from './CardFeesSection';
import { MinimumPaymentSection } from './MinimumPaymentSection';

/**
 * Haklarım: the place that tells you what you did not know. An annual card fee you can ask back,
 * with where to apply and on what basis; and what paying only the minimum really costs. Every legal
 * value carries its source; the figures come from the back end.
 */
export function RightsPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t('rights.title')}>
        <p>{t('rights.lead')}</p>
      </PageHeader>
      <div className="grid grid-cols-1 gap-12">
        <CardFeesSection />
        <MinimumPaymentSection />
      </div>
    </>
  );
}
