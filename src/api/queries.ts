import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from './context';
import { ApiError, type NewTransaction, type ProviderId, type Settings, type UploadOptions } from './types';

export const keys = {
  providers: ['providers'] as const,
  settings: ['settings'] as const,
  statements: ['statements'] as const,
  statement: (id: string) => ['statements', id] as const,
  schedule: (months: number) => ['schedule', months] as const,
  monthly: (month: string) => ['monthly', month] as const,
  subscriptions: ['subscriptions'] as const,
  analysis: (id: string) => ['analysis', id] as const,
};

export function useProviders() {
  const api = useApi();
  return useQuery({ queryKey: keys.providers, queryFn: () => api.getProviders() });
}

export function useSelectProvider() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: ProviderId) => api.selectProvider(id),
    onSuccess: (data) => qc.setQueryData(keys.providers, data),
  });
}

export function useSettings() {
  const api = useApi();
  return useQuery({ queryKey: keys.settings, queryFn: () => api.getSettings() });
}

export function useUpdateSettings() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settings: Settings) => api.putSettings(settings),
    onSuccess: (data) => qc.setQueryData(keys.settings, data),
  });
}

export function useStatements() {
  const api = useApi();
  return useQuery({ queryKey: keys.statements, queryFn: () => api.listStatements() });
}

export function useStatement(id: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: keys.statement(id ?? ''),
    queryFn: () => api.getStatement(id!),
    enabled: Boolean(id),
  });
}

/** Invalidate everything that is derived from statements and transactions. */
function useInvalidateDerived() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: keys.statements }),
      qc.invalidateQueries({ queryKey: ['schedule'] }),
      qc.invalidateQueries({ queryKey: ['monthly'] }),
      qc.invalidateQueries({ queryKey: keys.subscriptions }),
    ]);
}

export function useUploadStatement() {
  const api = useApi();
  const invalidate = useInvalidateDerived();
  return useMutation({
    mutationFn: ({ file, options }: { file: File; options?: UploadOptions }) => api.uploadStatement(file, options),
    onSuccess: () => invalidate(),
  });
}

export function useCreateTransaction() {
  const api = useApi();
  const invalidate = useInvalidateDerived();
  return useMutation({
    mutationFn: (body: NewTransaction) => api.createTransaction(body),
    onSuccess: () => invalidate(),
  });
}

export function useSchedule(months: number) {
  const api = useApi();
  return useQuery({ queryKey: keys.schedule(months), queryFn: () => api.getSchedule(months) });
}

export function useMonthlySummary(month: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: keys.monthly(month ?? ''),
    queryFn: () => api.getMonthlySummary(month!),
    enabled: Boolean(month),
  });
}

export function useSubscriptions() {
  const api = useApi();
  return useQuery({ queryKey: keys.subscriptions, queryFn: () => api.getSubscriptions() });
}

export function useAnalysis(id: string | undefined, enabled: boolean) {
  const api = useApi();
  return useQuery({
    queryKey: keys.analysis(id ?? ''),
    queryFn: () => api.getAnalysis(id!),
    enabled: Boolean(id) && enabled,
  });
}

export const JOB_POLL_MS = 1500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Starts the model call and keeps polling its job until it settles, so the
 * mutation stays pending for the whole 10-60 s the CLI may take.
 */
export function useAnalyze(pollMs = JOB_POLL_MS) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { job_id } = await api.analyzeStatement(id);
      void qc.invalidateQueries({ queryKey: keys.statements });
      for (;;) {
        await sleep(pollMs);
        const job = await api.getJob(job_id);
        if (job.status === 'done') return job;
        if (job.status === 'failed') throw new ApiError(500, 'analysis_failed', job.error ?? 'Analysis failed.');
      }
    },
    onSettled: (_data, _error, id) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.statements }),
        qc.invalidateQueries({ queryKey: keys.analysis(id) }),
      ]),
  });
}
