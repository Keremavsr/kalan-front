import { useTranslation } from 'react-i18next';
import { EmptyState, PageHeader } from '../../components/ui';

/**
 * Haklarım: fee lines a cardholder can dispute (annual card fee, late interest, charges added
 * without asking). The back end does not report them yet; the screen holds its place in the menu
 * and says plainly what will appear here.
 */
export function RightsPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t('rights.title')}>
        <p>{t('rights.lead')}</p>
      </PageHeader>
      <EmptyState mark="empty" title={t('rights.emptyTitle')}>
        {t('rights.empty')}
      </EmptyState>
    </>
  );
}
