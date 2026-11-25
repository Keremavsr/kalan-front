import { useTranslation } from 'react-i18next';
import { useTemplateDraft } from '../../api/queries';
import type { ApiError } from '../../api/types';
import { Button, Notice } from '../../components/ui';
import { CopyButton } from '../../components/ui/CopyButton';
import { ExternalLink } from '../../components/ui/ExternalLink';
import { TextAreaField } from '../../components/ui/TextArea';
import { BANK_ISSUE_URL } from './links';

/**
 * For a statement the AI fallback read: ask the model for a YAML bank template, show it with what the
 * check found, and point to the public issue form. Nothing is sent from here; the user copies and posts.
 */
export function TemplateDraftPanel({ statementId }: { statementId: string }) {
  const { t } = useTranslation();
  const draft = useTemplateDraft();
  const data = draft.data;

  return (
    <div className="grid gap-4 border-t border-line pt-5">
      <div className="max-w-measure">
        <h3 className="text-title font-bold text-ink">{t('statements.draftTitle')}</h3>
        <p className="mt-2 text-body text-ink">{t('statements.draftIntro')}</p>
      </div>

      {data ? (
        <div className="enter grid gap-4">
          {data.valid && data.detect && !data.parse_error ? (
            <Notice tone="done" title={t('statements.draftValid')}>
              {data.reconciliation?.status === 'ok' ? t('statements.draftReconOk') : t('statements.draftReconOff')}
            </Notice>
          ) : (
            <Notice tone="warning" title={t('statements.draftInvalid')}>
              <ul className="mt-1 list-disc pl-5">
                {data.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
                {!data.detect ? <li>{t('statements.draftNoDetect')}</li> : null}
                {data.parse_error ? <li>{data.parse_error}</li> : null}
              </ul>
            </Notice>
          )}
          <TextAreaField label={t('statements.draftYaml')} value={data.yaml} readOnly rows={Math.min(16, data.yaml.split('\n').length + 1)} spellCheck={false} />
          <p className="max-w-measure text-meta text-muted">{t('statements.draftShare')}</p>
          <div className="flex flex-wrap items-center gap-3">
            <CopyButton text={data.yaml} label={t('statements.draftCopy')} done={t('statements.copied')} failed={t('statements.copyFailed')} />
            <ExternalLink href={BANK_ISSUE_URL} button>
              {t('statements.issueLink')}
            </ExternalLink>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" loading={draft.isPending} onClick={() => draft.mutate(statementId)}>
            {draft.isPending ? t('statements.draftPending') : t('statements.draftStart')}
          </Button>
          {draft.isPending ? <span className="text-meta text-muted">{t('statements.slowHint')}</span> : null}
        </div>
      )}

      {draft.isError ? <DraftError error={draft.error} /> : null}
    </div>
  );
}

function DraftError({ error }: { error: ApiError }) {
  const { t } = useTranslation();
  const known: Record<string, string> = {
    no_provider: t('statements.errNoProvider'),
    provider_unavailable: t('statements.errProviderUnavailable'),
    provider_failed: t('statements.errProviderFailed'),
    no_statement_text: t('statements.errNoText'),
    network: t('statements.errNetwork'),
  };
  return (
    <Notice tone="critical" role="alert">
      {known[error.code] ?? t('statements.errGeneric', { message: error.message })}
    </Notice>
  );
}
