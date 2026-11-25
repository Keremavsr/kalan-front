import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { invalidate, invalidation, useAnalysisRun, useProviders } from '../../api/queries';
import { useToast } from '../../components/ui';

/**
 * Thin strip under the menu while the AI tool reads the statements ("Claude Code ekstrelerini okuyor: 12/25").
 * When the run ends, every screen that shows categories, commentary or suggestions is refreshed.
 */
export function AnalysisStrip() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const run = useAnalysisRun();
  const providers = useProviders();
  const job = run.data;
  const status = job?.status;
  const was = useRef(status);

  useEffect(() => {
    const before = was.current;
    was.current = status;
    if (before !== 'pending' || !status || status === 'pending') return;
    void invalidate(qc, invalidation.analysisRun);
    if (status === 'done') toast.show(t('ai.finished'), 'positive');
    else toast.show(t('ai.failed'), 'neutral');
  }, [status, qc, toast, t]);

  if (!job || status !== 'pending') return null;
  const name = providers.data?.providers.find((p) => p.id === providers.data?.selected)?.name ?? t('ai.tool');
  const total = job.total ?? 0;
  const done = Math.min(job.done ?? 0, total);
  const label =
    job.phase === 'suggestions' || total === 0 ? t('ai.writing', { name }) : t('ai.reading', { name, done, total });

  return (
    <div role="status" className="border-b border-line bg-ground-alt">
      <div className="mx-auto flex max-w-content items-center gap-4 px-(--space-gutter) py-2">
        <p className="shrink-0 text-meta font-semibold text-ink">{label}</p>
        <div
          className="h-1 min-w-0 flex-1 overflow-hidden rounded-pill bg-line"
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={total || 1}
          aria-valuenow={job.phase === 'suggestions' ? total || 1 : done}
        >
          {job.phase === 'suggestions' || total === 0 ? (
            <div className="indeterminate h-full w-1/3 rounded-pill bg-ink" />
          ) : (
            <div
              className="h-full rounded-pill bg-ink transition-[width] duration-(--duration-2) ease-(--ease-out)"
              style={{ width: `${total ? (done / total) * 100 : 0}%` }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
