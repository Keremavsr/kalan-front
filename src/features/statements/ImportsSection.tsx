import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDeleteImport, useImportFile, useImports } from '../../api/queries';
import type { ImportResult, ImportSummary } from '../../api/types';
import { Button, List, ListRow, Modal, Notice, QueryState, useToast } from '../../components/ui';
import { formatDate, formatMonth } from '../../lib/format';
import { useIntlLocale } from '../../lib/useLocale';
import { FileDrop } from './FileDrop';

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = '.csv,.ofx,.qfx,.qif,text/csv,application/x-ofx';

/** CSV, OFX and QIF files from a bank's own export: upload, what was read, the list, delete. */
export function ImportsSection() {
  const { t } = useTranslation();
  const locale = useIntlLocale();
  const imports = useImports();
  const importFile = useImportFile();
  const [tooLarge, setTooLarge] = useState(false);
  const [toDelete, setToDelete] = useState<ImportSummary | null>(null);

  function take(file: File) {
    setTooLarge(false);
    importFile.reset();
    if (file.size > MAX_BYTES) return setTooLarge(true);
    importFile.mutate({ file });
  }

  const months = (list: string[]) => list.map((m) => formatMonth(m, locale, 'short')).join(', ');
  const items = imports.data?.items ?? [];

  return (
    <div className="grid gap-4">
      <FileDrop
        size="compact"
        title={t('statements.importDrop')}
        hint={t('statements.importHint')}
        accept={ACCEPT}
        chooseLabel={t('statements.importChoose')}
        disabled={importFile.isPending}
        onFile={take}
      />
      {importFile.isPending ? (
        <p role="status" className="text-body text-muted">
          {t('statements.importPending')}
        </p>
      ) : null}
      {tooLarge ? (
        <Notice tone="critical" role="alert">
          {t('statements.errTooLarge')}
        </Notice>
      ) : null}
      {importFile.isSuccess ? <ImportDone result={importFile.data} months={months(importFile.data.months)} /> : null}
      {importFile.isError ? (
        <Notice tone="critical" role="alert">
          {importFile.error.code === 'import_unreadable'
            ? t('statements.importUnreadable', { message: importFile.error.message })
            : importFile.error.code === 'invalid_mapping'
              ? t('statements.importMapping')
              : importFile.error.code === 'file_too_large'
                ? t('statements.errTooLarge')
                : importFile.error.code === 'network'
                  ? t('statements.errNetwork')
                  : t('statements.errGeneric', { message: importFile.error.message })}
        </Notice>
      ) : null}

      <QueryState query={imports}>
        {() =>
          items.length ? (
            <List label={t('statements.importList')}>
              {items.map((im) => (
                <ListRow
                  key={im.id}
                  meta={formatDate(im.created_at.slice(0, 10), locale)}
                  title={t('statements.importRowTitle', { format: im.format.toUpperCase(), count: im.imported })}
                  detail={
                    <span className="text-meta text-muted">
                      {im.months.length ? months(im.months) : t('statements.importNoMonths')} · {im.currency}
                      {im.skipped_duplicates ? <> · {t('statements.importSkipped', { count: im.skipped_duplicates })}</> : null}
                    </span>
                  }
                  aside={
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<Trash2 aria-hidden className="size-4" />}
                      onClick={() => setToDelete(im)}
                      aria-label={t('statements.importDeleteLabel', { format: im.format.toUpperCase(), date: formatDate(im.created_at.slice(0, 10), locale) })}
                    >
                      {t('statements.delete')}
                    </Button>
                  }
                />
              ))}
            </List>
          ) : (
            <p className="text-meta text-muted">{t('statements.importEmpty')}</p>
          )
        }
      </QueryState>

      <DeleteImport target={toDelete} onClose={() => setToDelete(null)} />
    </div>
  );
}

function ImportDone({ result, months }: { result: ImportResult; months: string }) {
  const { t } = useTranslation();
  return (
    <Notice tone="done" role="status" title={t('statements.importDone', { count: result.imported })}>
      <p>
        {result.months.length ? t('statements.importMonths', { months }) : null}
        {result.skipped_duplicates ? <> {t('statements.importSkippedSentence', { count: result.skipped_duplicates })}</> : null}
      </p>
      {result.detected.date_ambiguous ? <p className="mt-2">{t('statements.importAmbiguous', { format: result.detected.date_format ?? '' })}</p> : null}
    </Notice>
  );
}

function DeleteImport({ target, onClose }: { target: ImportSummary | null; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const remove = useDeleteImport();
  const [last, setLast] = useState<ImportSummary | null>(target);
  // Keep the text while the dialog closes.
  if (target && target !== last) setLast(target);
  const shown = target ?? last;

  return (
    <Modal
      open={Boolean(target)}
      onClose={onClose}
      title={t('statements.importDeleteTitle')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            loading={remove.isPending}
            onClick={() =>
              shown &&
              remove.mutate(shown.id, {
                onSuccess: () => {
                  onClose();
                  toast.show(t('statements.importDeleted'), 'positive');
                },
              })
            }
          >
            {t('statements.deleteConfirm')}
          </Button>
        </>
      }
    >
      <p className="text-body text-ink">{shown ? t('statements.importDeleteBody', { count: shown.imported }) : null}</p>
      {remove.isError ? (
        <Notice tone="critical" role="alert" className="mt-4 px-0">
          {t('statements.errGeneric', { message: remove.error.message })}
        </Notice>
      ) : null}
    </Modal>
  );
}
