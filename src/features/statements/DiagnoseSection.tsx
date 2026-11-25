import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDiagnose } from '../../api/queries';
import { isApiError, type DiagnosisReport, type PdfPasswordHint } from '../../api/types';
import { KeyValue, Notice, Section } from '../../components/ui';
import { CopyButton } from '../../components/ui/CopyButton';
import { ExternalLink } from '../../components/ui/ExternalLink';
import { TextAreaField } from '../../components/ui/TextArea';
import { FileDrop } from './FileDrop';
import { BANK_ISSUE_URL } from './links';
import { PasswordPrompt } from './UploadPanel';

export interface DiagnoseRequest {
  file: File;
  password?: string | undefined;
  /** Changes on every request so the same file can be diagnosed twice. */
  key: number;
}

/** The anonymous layout report for a bank kalan cannot read, to paste into the public issue form. */
export function DiagnoseSection({ request }: { request: DiagnoseRequest | null }) {
  const { t } = useTranslation();
  const diagnose = useDiagnose();
  const [file, setFile] = useState<File | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  function run(target: File, password?: string) {
    setFile(target);
    diagnose.mutate({ file: target, options: password ? { password } : {} });
  }

  useEffect(() => {
    if (!request) return;
    run(request.file, request.password);
    ref.current?.scrollIntoView?.({ block: 'start' });
    // Only a new request starts a run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.key]);

  const passwordError = isApiError(diagnose.error, 'pdf_password_required') || isApiError(diagnose.error, 'pdf_password_wrong');
  const data = diagnose.data;

  return (
    <div ref={ref} className="scroll-mt-24">
      <Section id="diagnose" title={t('statements.diagnoseTitle')} description={t('statements.diagnoseIntro')}>
        <div className="grid gap-4">
          <FileDrop
            size="compact"
            title={file && (diagnose.isPending || data) ? file.name : t('statements.diagnoseDrop')}
            hint={t('statements.diagnoseHint')}
            accept="application/pdf,.pdf"
            chooseLabel={t('statements.diagnoseChoose')}
            disabled={diagnose.isPending}
            onFile={(f) => run(f)}
          />
          {diagnose.isPending ? (
            <p role="status" className="text-body text-muted">
              {t('statements.diagnosePending')}
            </p>
          ) : null}
          {passwordError && file ? (
            <PasswordPrompt
              wrong={diagnose.error?.code === 'pdf_password_wrong'}
              hints={Array.isArray(diagnose.error?.details.hints) ? (diagnose.error.details.hints as PdfPasswordHint[]) : []}
              pending={diagnose.isPending}
              allowRemember={false}
              onSubmit={(password) => run(file, password)}
            />
          ) : null}
          {diagnose.isError && !passwordError ? (
            <Notice tone="critical" role="alert">
              {diagnose.error.code === 'not_pdf'
                ? t('statements.notPdf')
                : diagnose.error.code === 'file_too_large'
                  ? t('statements.errTooLarge')
                  : diagnose.error.code === 'invalid_pdf'
                    ? t('statements.errInvalidPdf')
                    : diagnose.error.code === 'network'
                      ? t('statements.errNetwork')
                      : t('statements.errGeneric', { message: diagnose.error.message })}
            </Notice>
          ) : null}
          {data && !diagnose.isPending ? <DiagnosisResult report={data.report} text={data.text} /> : null}
        </div>
      </Section>
    </div>
  );
}

const top = (styles: Record<string, number>) => {
  const [name, n] = Object.entries(styles).sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
  return n > 0 ? name : null;
};

function DiagnosisResult({ report, text }: { report: DiagnosisReport; text: string }) {
  const { t } = useTranslation();
  const numbers = top(report.number_styles);
  const dates = top(report.date_styles);
  const near = report.templates.find((tpl) => tpl.detected) ?? report.templates[0];
  return (
    <div className="enter grid gap-5 rounded-card bg-paper px-6 py-5">
      {!report.has_text ? <Notice tone="warning" title={t('statements.diagnoseNoText')} className="px-0 py-0" /> : null}
      <KeyValue
        className="max-w-xl"
        items={[
          { label: t('statements.diagnosePages'), value: report.page_count },
          { label: t('statements.diagnoseLines'), value: report.line_count },
          { label: t('statements.diagnoseNumbers'), value: numbers ?? t('statements.diagnoseNone') },
          { label: t('statements.diagnoseDates'), value: dates ?? t('statements.diagnoseNone') },
          {
            label: t('statements.diagnoseTemplate'),
            value: near?.anchors
              ? t('statements.diagnoseAnchors', {
                  id: near.id,
                  found: near.anchors.detect_all.found,
                  total: near.anchors.detect_all.total,
                })
              : t('statements.diagnoseNone'),
          },
        ]}
      />
      <TextAreaField label={t('statements.diagnoseText')} value={text} readOnly rows={8} spellCheck={false} hint={t('statements.diagnoseTextHint')} />
      <div className="flex flex-wrap items-center gap-3">
        <CopyButton text={text} label={t('statements.diagnoseCopy')} done={t('statements.copied')} failed={t('statements.copyFailed')} />
        <ExternalLink href={BANK_ISSUE_URL} button>
          {t('statements.issueLink')}
        </ExternalLink>
      </div>
    </div>
  );
}
