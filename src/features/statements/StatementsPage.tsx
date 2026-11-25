import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader, Section } from '../../components/ui';
import { DiagnoseSection, type DiagnoseRequest } from './DiagnoseSection';
import { ExportSection } from './ExportSection';
import { ImportsSection } from './ImportsSection';
import { StoredStatements } from './StoredStatements';
import { UploadPanel } from './UploadPanel';

/**
 * Ekstreler: the PDF upload with every answer the back end can give, the stored statements, then the
 * other ways in and out (bank exports, ledger files) and the layout report for an unsupported bank.
 */
export function StatementsPage() {
  const { t } = useTranslation();
  const [diagnose, setDiagnose] = useState<DiagnoseRequest | null>(null);

  return (
    <>
      <PageHeader title={t('statements.title')}>
        <p>{t('statements.intro')}</p>
      </PageHeader>

      <div className="grid grid-cols-1 gap-12">
        <UploadPanel onDiagnose={(file, password) => setDiagnose({ file, password, key: Date.now() })} />
        <StoredStatements />
        <Section id="files" band title={t('statements.filesTitle')} description={t('statements.filesIntro')}>
          <div className="grid grid-cols-1 gap-10 xl:grid-cols-2 xl:items-start">
            <div>
              <h3 className="mb-4 text-title font-bold text-ink">{t('statements.importTitle')}</h3>
              <ImportsSection />
            </div>
            <div>
              <h3 className="mb-4 text-title font-bold text-ink">{t('statements.exportTitle')}</h3>
              <ExportSection />
            </div>
          </div>
        </Section>
        <DiagnoseSection request={diagnose} />
      </div>
    </>
  );
}
