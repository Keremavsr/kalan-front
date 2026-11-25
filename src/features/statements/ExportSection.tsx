import { useState } from 'react';
import { Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useExport } from '../../api/queries';
import type { ExportFormat } from '../../api/types';
import { Button, Notice, Segmented, useToast } from '../../components/ui';
import { saveTextFile } from './download';

type What = 'transactions' | 'plans';

/** Everything kalan stores, as a file for a ledger program or a spreadsheet. */
export function ExportSection() {
  const { t } = useTranslation();
  const toast = useToast();
  const exporter = useExport();
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [what, setWhat] = useState<What>('transactions');
  const [skipped, setSkipped] = useState<number | null>(null);
  const plans = format === 'csv' && what === 'plans';

  function download() {
    setSkipped(null);
    exporter.mutate(
      { format, what: plans ? 'plans' : 'transactions' },
      {
        onSuccess: (file) => {
          saveTextFile(file.text, file.filename, file.contentType);
          setSkipped(file.skippedRows && file.skippedRows > 0 ? file.skippedRows : null);
          toast.show(t('statements.exportSaved', { name: file.filename }), 'positive');
        },
      },
    );
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <span className="w-24 font-semibold text-ink">{t('statements.exportFormat')}</span>
        <Segmented<ExportFormat>
          label={t('statements.exportFormat')}
          value={format}
          onChange={setFormat}
          options={[
            { value: 'csv', label: 'CSV' },
            { value: 'ofx', label: 'OFX' },
            { value: 'hledger', label: 'hledger' },
            { value: 'beancount', label: 'Beancount' },
          ]}
        />
      </div>
      {format === 'csv' ? (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <span className="w-24 font-semibold text-ink">{t('statements.exportWhat')}</span>
          <Segmented<What>
            label={t('statements.exportWhat')}
            value={what}
            onChange={setWhat}
            options={[
              { value: 'transactions', label: t('statements.exportTransactions') },
              { value: 'plans', label: t('statements.exportPlans') },
            ]}
          />
        </div>
      ) : null}
      <p className="max-w-measure text-meta text-muted">{t(`statements.exportAbout_${plans ? 'plans' : format}`)}</p>
      <div>
        <Button variant="secondary" loading={exporter.isPending} icon={<Download aria-hidden className="size-4" />} onClick={download}>
          {t('statements.exportDownload')}
        </Button>
      </div>
      {skipped ? <Notice tone="info">{t('statements.exportSkipped', { count: skipped })}</Notice> : null}
      {exporter.isError ? (
        <Notice tone="critical" role="alert">
          {exporter.error.code === 'network' ? t('statements.errNetwork') : t('statements.errGeneric', { message: exporter.error.message })}
        </Notice>
      ) : null}
    </div>
  );
}
