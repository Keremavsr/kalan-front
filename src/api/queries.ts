import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useApi } from './context';
import {
  ApiError,
  type BacktestQuery,
  type CancelledSubscription,
  type DiagnoseOptions,
  type ExportQuery,
  type ImportOptions,
  type IsoDate,
  type IsoMonth,
  type MinimumPaymentQuery,
  type NewCategoryRule,
  type NewFixedCost,
  type NewTransaction,
  type ProviderId,
  type RuleOverrides,
  type Settings,
  type ShareCardQuery,
  type SimulationRequest,
  type TransactionFilter,
  type UploadOptions,
} from './types';

// Every hook's error is an ApiError (the client and the mock never throw anything else).
declare module '@tanstack/react-query' {
  interface Register {
    defaultError: ApiError;
  }
}

export const keys = {
  providers: ['providers'] as const,
  settings: ['settings'] as const,
  statements: ['statements'] as const,
  statement: (id: string) => ['statements', id] as const,
  pdfPasswords: ['pdf-passwords'] as const,
  categoryRules: ['category-rules'] as const,
  imports: ['imports'] as const,
  transactions: (filter: TransactionFilter = {}) => ['transactions', filter.month ?? null, filter.source ?? null] as const,
  fixedCosts: ['fixed-costs'] as const,
  schedule: (months: number) => ['schedule', months] as const,
  simulation: (body: SimulationRequest) => ['simulation', body] as const,
  monthly: (month: string) => ['monthly', month] as const,
  subscriptions: ['subscriptions'] as const,
  alerts: ['alerts'] as const,
  analysis: (id: string) => ['analysis', id] as const,
  analysisRun: ['analysis-all'] as const,
  cards: ['cards'] as const,
  suggestions: ['suggestions'] as const,
  frequentPlaces: ['frequent-places'] as const,
  insights: {
    all: ['insights'] as const,
    rules: ['insights', 'rules'] as const,
    minimumPayment: (q: MinimumPaymentQuery = {}) =>
      ['insights', 'minimum-payment', q.statement_id ?? null, q.include_installments ?? false, q.cycles ?? null] as const,
    cardFees: ['insights', 'card-fees'] as const,
    cardFeePrompt: (id: string) => ['insights', 'card-fees', id, 'prompt'] as const,
    whichCard: (date: IsoDate | null) => ['insights', 'which-card', date] as const,
    shareCard: (q: ShareCardQuery = {}) => ['insights', 'share-card', q.locale ?? 'tr', q.amounts ?? false] as const,
    forecast: (includeFixed: boolean) => ['insights', 'forecast', includeFixed] as const,
    backtest: (q: BacktestQuery = {}) =>
      ['insights', 'forecast', 'backtest', q.include_fixed ?? true, q.history ?? null, q.min_history ?? null] as const,
    earlyPayoff: ['insights', 'early-payoff'] as const,
    earlyPayoffPlan: (planId: string, month: IsoMonth | null) => ['insights', 'early-payoff', planId, month] as const,
    cancelled: ['insights', 'cancelled-subscriptions'] as const,
    fixedMatches: ['insights', 'fixed-costs', 'matches'] as const,
  },
};

/**
 * Which caches a write makes stale. Every insight reads the stored rows, so `['insights']` is in all
 * data groups; the user-setting groups (rules, cancellations) are narrower.
 */
export const invalidation = {
  /** Statements, manual rows, imports: everything computed from transactions. */
  data: [
    keys.statements,
    ['transactions'],
    ['schedule'],
    ['simulation'],
    ['monthly'],
    keys.subscriptions,
    keys.alerts,
    keys.insights.all,
    keys.cards,
    keys.suggestions,
    keys.frequentPlaces,
    // A new statement joins the AI batch when a tool is chosen; the strip finds it.
    keys.analysisRun,
  ],
  /** What the run over every statement changes: categories, commentary, suggestions. */
  analysisRun: [
    keys.statements,
    ['analysis'],
    ['transactions'],
    ['monthly'],
    keys.subscriptions,
    keys.alerts,
    keys.insights.all,
    keys.suggestions,
    keys.frequentPlaces,
  ],
  /** Closing or reopening a plan moves the schedule, the forecast and the alerts. */
  plans: [['schedule'], ['simulation'], keys.alerts, keys.insights.all, keys.suggestions],
  /** A new expected amount moves the forecast and the subscription list. */
  expected: [keys.subscriptions, keys.alerts, keys.insights.all, keys.suggestions],
  /** A card name shows on every screen. */
  cards: [keys.cards, keys.statements, ['transactions'], ['schedule'], keys.alerts, keys.subscriptions, keys.insights.all],
  /** Fixed costs: the schedule's `fixed` series, forecast and fixed-cost matching. */
  fixedCosts: [keys.fixedCosts, ['schedule'], ['simulation'], keys.alerts, keys.insights.all],
  /** A category rule recategorises stored rows. */
  categoryRule: [keys.categoryRules, keys.statements, ['transactions'], ['monthly'], keys.subscriptions, keys.insights.all],
  /** Overrides change only the minimum payment plan. */
  insightRules: [keys.insights.rules, ['insights', 'minimum-payment']],
  /** Cancellations feed the `charged_after_cancel` alert. */
  cancelled: [keys.insights.cancelled, keys.alerts],
} satisfies Record<string, readonly (readonly unknown[])[]>;

export function invalidate(qc: QueryClient, group: readonly (readonly unknown[])[]) {
  return Promise.all(group.map((queryKey) => qc.invalidateQueries({ queryKey })));
}

function useInvalidate(group: readonly (readonly unknown[])[]) {
  const qc = useQueryClient();
  return () => invalidate(qc, group);
}

// -- health and setup ----------------------------------------------------------------------------

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
    onSuccess: (data) => {
      const before = qc.getQueryData<Settings>(keys.settings);
      qc.setQueryData(keys.settings, data);
      // The base currency feeds fixed-cost defaults, the forecast and exports.
      if (before && before.base_currency !== data.base_currency) return invalidate(qc, invalidation.data);
    },
  });
}

// -- statements -----------------------------------------------------------------------------------

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

/**
 * Upload with optional `password` / `rememberPassword` / `aiFallback`. Resolves to the statement;
 * typed errors to handle: `pdf_password_required`, `pdf_password_wrong`, `save_blocked`, `duplicate`,
 * `unknown_format`, `ai_fallback_failed`, `parse_error`, `invalid_pdf`, `not_pdf`, `file_too_large`.
 */
export function useUploadStatement() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, options }: { file: File; options?: UploadOptions }) => api.uploadStatement(file, options),
    onSuccess: (_data, vars) =>
      Promise.all([
        invalidate(qc, invalidation.data),
        vars.options?.rememberPassword ? qc.invalidateQueries({ queryKey: keys.pdfPasswords }) : null,
      ]),
  });
}

/** Same as useUploadStatement, also reporting whether the password was remembered. */
export function useUploadStatementDetailed() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, options }: { file: File; options?: UploadOptions }) => api.uploadStatementDetailed(file, options),
    onSuccess: (data) =>
      Promise.all([
        invalidate(qc, invalidation.data),
        data.passwordRemembered ? qc.invalidateQueries({ queryKey: keys.pdfPasswords }) : null,
      ]),
  });
}

export function useDeleteStatement() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteStatement(id),
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: keys.statement(id) });
      qc.removeQueries({ queryKey: keys.analysis(id) });
      return invalidate(qc, invalidation.data);
    },
  });
}

/** AI-fallback statements only; 409 `no_statement_text`, `no_provider`, `provider_unavailable`; 502 `provider_failed`. */
export function useTemplateDraft() {
  const api = useApi();
  return useMutation({ mutationFn: (statementId: string) => api.createTemplateDraft(statementId) });
}

export function usePdfPasswords() {
  const api = useApi();
  return useQuery({ queryKey: keys.pdfPasswords, queryFn: () => api.getPdfPasswords() });
}

export function useRememberPdfPassword() {
  const api = useApi();
  const refresh = useInvalidate([keys.pdfPasswords]);
  return useMutation({
    mutationFn: ({ bank, password }: { bank: string; password: string }) => api.putPdfPassword(bank, password),
    onSuccess: () => refresh(),
  });
}

export function useForgetPdfPassword() {
  const api = useApi();
  const refresh = useInvalidate([keys.pdfPasswords]);
  return useMutation({ mutationFn: (bank: string) => api.deletePdfPassword(bank), onSuccess: () => refresh() });
}

// -- categories and diagnosis -----------------------------------------------------------------------

export function useCategoryRules() {
  const api = useApi();
  return useQuery({ queryKey: keys.categoryRules, queryFn: () => api.getCategoryRules() });
}

export function useCreateCategoryRule() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: NewCategoryRule) => api.createCategoryRule(body),
    // ['statements'] also covers every single-statement cache (['statements', id]).
    onSuccess: (data) => invalidate(qc, data.applied > 0 ? invalidation.categoryRule : [keys.categoryRules]),
  });
}

/** Categories the rule set stay, so only the rule list changes. */
export function useDeleteCategoryRule() {
  const api = useApi();
  const refresh = useInvalidate([keys.categoryRules]);
  return useMutation({ mutationFn: (id: string) => api.deleteCategoryRule(id), onSuccess: () => refresh() });
}

/** Nothing is stored. */
export function useDiagnose() {
  const api = useApi();
  return useMutation({ mutationFn: ({ file, options }: { file: File; options?: DiagnoseOptions }) => api.diagnose(file, options) });
}

// -- imports --------------------------------------------------------------------------------------

export function useImports() {
  const api = useApi();
  return useQuery({ queryKey: keys.imports, queryFn: () => api.listImports() });
}

export function useImportFile() {
  const api = useApi();
  const refresh = useInvalidate([...invalidation.data, keys.imports]);
  return useMutation({
    mutationFn: ({ file, options }: { file: File; options?: ImportOptions }) => api.importFile(file, options),
    onSuccess: () => refresh(),
  });
}

export function useDeleteImport() {
  const api = useApi();
  const refresh = useInvalidate([...invalidation.data, keys.imports]);
  return useMutation({ mutationFn: (id: string) => api.deleteImport(id), onSuccess: () => refresh() });
}

// -- manual entry ---------------------------------------------------------------------------------

export function useTransactions(filter: TransactionFilter = {}, { enabled = true }: { enabled?: boolean } = {}) {
  const api = useApi();
  return useQuery({ queryKey: keys.transactions(filter), queryFn: () => api.listTransactions(filter), enabled });
}

export function useCreateTransaction() {
  const api = useApi();
  const refresh = useInvalidate(invalidation.data);
  return useMutation({
    mutationFn: (body: NewTransaction) => api.createTransaction(body),
    onSuccess: () => refresh(),
  });
}

export function useDeleteTransaction() {
  const api = useApi();
  const refresh = useInvalidate(invalidation.data);
  return useMutation({ mutationFn: (id: string) => api.deleteTransaction(id), onSuccess: () => refresh() });
}

// -- fixed costs ----------------------------------------------------------------------------------

export function useFixedCosts() {
  const api = useApi();
  return useQuery({ queryKey: keys.fixedCosts, queryFn: () => api.listFixedCosts() });
}

export function useCreateFixedCost() {
  const api = useApi();
  const refresh = useInvalidate(invalidation.fixedCosts);
  return useMutation({ mutationFn: (body: NewFixedCost) => api.createFixedCost(body), onSuccess: () => refresh() });
}

export function useDeleteFixedCost() {
  const api = useApi();
  const refresh = useInvalidate(invalidation.fixedCosts);
  return useMutation({ mutationFn: (id: string) => api.deleteFixedCost(id), onSuccess: () => refresh() });
}

// -- calculations ---------------------------------------------------------------------------------

export function useSchedule(months: number) {
  const api = useApi();
  return useQuery({ queryKey: keys.schedule(months), queryFn: () => api.getSchedule(months) });
}

/** What-if purchase against the current schedule. Pass `undefined` until the form is valid. */
export function useSimulateInstallment(body: SimulationRequest | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: keys.simulation(body ?? { amount: 0, count: 0, start_month: '' }),
    queryFn: () => api.simulateInstallment(body!),
    enabled: Boolean(body),
  });
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

export function useAlerts() {
  const api = useApi();
  return useQuery({ queryKey: keys.alerts, queryFn: () => api.getAlerts() });
}

// -- model analysis -------------------------------------------------------------------------------

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
    // The model fills in categories, which moves the monthly summary and subscriptions too.
    onSettled: (_data, _error, id) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.statements }),
        qc.invalidateQueries({ queryKey: keys.analysis(id) }),
        qc.invalidateQueries({ queryKey: ['transactions'] }),
        qc.invalidateQueries({ queryKey: ['monthly'] }),
        qc.invalidateQueries({ queryKey: keys.subscriptions }),
      ]),
  });
}

// -- insights -------------------------------------------------------------------------------------

export function useInsightRules() {
  const api = useApi();
  return useQuery({ queryKey: keys.insights.rules, queryFn: () => api.getInsightRules() });
}

/** The body replaces all overrides; `{}` clears them. */
export function useUpdateInsightRules() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (overrides: Partial<RuleOverrides>) => api.putInsightRules(overrides),
    onSuccess: (data) => {
      qc.setQueryData(keys.insights.rules, data);
      return qc.invalidateQueries({ queryKey: ['insights', 'minimum-payment'] });
    },
  });
}

/** 409 `no_statements`, 404 `statement_not_found`. */
export function useMinimumPayment(query: MinimumPaymentQuery = {}) {
  const api = useApi();
  return useQuery({ queryKey: keys.insights.minimumPayment(query), queryFn: () => api.getMinimumPayment(query) });
}

export function useCardFees() {
  const api = useApi();
  return useQuery({ queryKey: keys.insights.cardFees, queryFn: () => api.listCardFees() });
}

export function useCardFeePrompt(transactionId: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: keys.insights.cardFeePrompt(transactionId ?? ''),
    queryFn: () => api.getCardFeePrompt(transactionId!),
    enabled: Boolean(transactionId),
  });
}

/** Sends the prompt to the selected provider; nothing is stored. */
export function useDraftCardFeeLetter() {
  const api = useApi();
  return useMutation({ mutationFn: (transactionId: string) => api.draftCardFeeLetter(transactionId) });
}

export function useWhichCard(date?: IsoDate) {
  const api = useApi();
  return useQuery({ queryKey: keys.insights.whichCard(date ?? null), queryFn: () => api.getWhichCard(date) });
}

export function useShareCard(query: ShareCardQuery = {}) {
  const api = useApi();
  return useQuery({ queryKey: keys.insights.shareCard(query), queryFn: () => api.getShareCard(query) });
}

export function useForecast(includeFixed = true) {
  const api = useApi();
  return useQuery({ queryKey: keys.insights.forecast(includeFixed), queryFn: () => api.getForecast(includeFixed) });
}

export function useForecastBacktest(query: BacktestQuery = {}) {
  const api = useApi();
  return useQuery({ queryKey: keys.insights.backtest(query), queryFn: () => api.getForecastBacktest(query) });
}

export function useEarlyPayoffOverview() {
  const api = useApi();
  return useQuery({ queryKey: keys.insights.earlyPayoff, queryFn: () => api.getEarlyPayoffOverview() });
}

/** 404 `plan_not_found`, 422 `month_outside_schedule`. */
export function useEarlyPayoff(planId: string | undefined, month?: IsoMonth) {
  const api = useApi();
  return useQuery({
    queryKey: keys.insights.earlyPayoffPlan(planId ?? '', month ?? null),
    queryFn: () => api.getEarlyPayoff(planId!, month),
    enabled: Boolean(planId),
  });
}

export function useCancelledSubscriptions() {
  const api = useApi();
  return useQuery({ queryKey: keys.insights.cancelled, queryFn: () => api.listCancelledSubscriptions() });
}

export function useAddCancelledSubscription() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CancelledSubscription) => api.addCancelledSubscription(body),
    onSuccess: (data) => {
      qc.setQueryData(keys.insights.cancelled, data);
      return qc.invalidateQueries({ queryKey: keys.alerts });
    },
  });
}

export function useDeleteCancelledSubscription() {
  const api = useApi();
  const refresh = useInvalidate(invalidation.cancelled);
  return useMutation({ mutationFn: (merchant: string) => api.deleteCancelledSubscription(merchant), onSuccess: () => refresh() });
}

export function useFixedCostMatches() {
  const api = useApi();
  return useQuery({ queryKey: keys.insights.fixedMatches, queryFn: () => api.getFixedCostMatches() });
}

/** A download, so a mutation: the screen saves `text` as `filename`. 422 `plans_csv_only`. */
export function useExport() {
  const api = useApi();
  return useMutation({ mutationFn: (query: ExportQuery) => api.exportData(query) });
}

// -- task 6: cards, plans, suggestions, the run over every statement ------------------------------

export function useCards() {
  const api = useApi();
  return useQuery({ queryKey: keys.cards, queryFn: () => api.listCards() });
}

export function useRenameCard() {
  const api = useApi();
  const refresh = useInvalidate(invalidation.cards);
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string | null }) => api.renameCard(id, name),
    onSuccess: refresh,
  });
}

export function useClosePlan() {
  const api = useApi();
  const refresh = useInvalidate(invalidation.plans);
  return useMutation({
    mutationFn: async ({ planId, close }: { planId: string; close: boolean }) => {
      if (close) await api.closePlan(planId);
      else await api.reopenPlan(planId);
    },
    onSuccess: refresh,
  });
}

export function useSetSubscriptionExpected() {
  const api = useApi();
  const refresh = useInvalidate(invalidation.expected);
  return useMutation({
    mutationFn: async ({ id, amount }: { id: string; amount: number | null }) => {
      if (amount === null) await api.clearSubscriptionExpected(id);
      else await api.setSubscriptionExpected(id, amount);
    },
    onSuccess: refresh,
  });
}

/** Suggestion texts come in tr or en; es and pt are written on this side from `kind` and `params`. */
export function useSuggestions(locale: string) {
  const api = useApi();
  const asked = locale === 'tr' ? 'tr' : 'en';
  return useQuery({ queryKey: [...keys.suggestions, asked], queryFn: () => api.getSuggestions(asked) });
}

export function useFrequentPlaces() {
  const api = useApi();
  return useQuery({ queryKey: keys.frequentPlaces, queryFn: () => api.getFrequentPlaces() });
}

/** How often the strip looks for a batch started while the app is open (an upload, another window). */
export const ANALYSIS_IDLE_POLL_MS = 15_000;

/**
 * The latest run over every statement. Polls every 1.5 s while it runs, and slowly while none runs, so a batch
 * that starts after the first look (an upload joining it, the automatic start) still shows its progress.
 */
export function useAnalysisRun(pollMs = JOB_POLL_MS, idleMs = ANALYSIS_IDLE_POLL_MS) {
  const api = useApi();
  return useQuery({
    queryKey: keys.analysisRun,
    queryFn: () => api.getAnalysisAll(),
    refetchInterval: (query) => (query.state.data?.status === 'pending' ? pollMs : idleMs),
  });
}

export function useStartAnalysisAll() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.startAnalysisAll(),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.analysisRun }),
  });
}
