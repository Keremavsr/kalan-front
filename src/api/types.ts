// Types for the kalan API contract v0.1 (docs/api.md).
// Money is always integer minor units plus an ISO 4217 currency code.

export type Minor = number;
export type IsoDate = string; // YYYY-MM-DD
export type IsoMonth = string; // YYYY-MM
export type Ratio = string; // decimal as string, e.g. "0.20"

export type ProviderId = 'claude-cli' | 'codex-cli' | 'agy-cli' | 'gemini-cli' | 'openai-compatible' | 'local';

export interface Provider {
  id: ProviderId;
  name: string;
  available: boolean;
  detail: string;
}

export interface ProvidersResponse {
  providers: Provider[];
  selected: ProviderId | null;
}

export type Locale = 'tr' | 'en';

export interface Settings {
  locale: Locale;
  base_currency: string;
  months_ahead: number;
}

export interface Reconciliation {
  status: 'ok' | 'mismatch';
  expected: Minor;
  computed: Minor;
  difference: Minor;
}

export type AnalysisStatus = 'none' | 'pending' | 'done' | 'failed';

export interface StatementSummary {
  id: string;
  bank: string;
  product: string;
  card_last4: string;
  period_start: IsoDate;
  period_end: IsoDate;
  due_date: IsoDate;
  currency: string;
  statement_total: Minor;
  minimum_payment: Minor;
  reconciliation: Reconciliation;
  analysis_status: AnalysisStatus;
}

export type TransactionKind =
  | 'purchase'
  | 'installment'
  | 'cash_advance'
  | 'fee'
  | 'tax'
  | 'interest'
  | 'payment'
  | 'refund'
  | 'carry_over'
  | 'other';

export const TRANSACTION_KINDS: readonly TransactionKind[] = [
  'purchase',
  'installment',
  'cash_advance',
  'fee',
  'tax',
  'interest',
  'payment',
  'refund',
  'carry_over',
  'other',
];

export interface InstallmentInfo {
  remaining_count: number;
  remaining_amount_each: Minor;
  is_last: boolean;
  plan_id: string;
}

export interface Transaction {
  id: string;
  date: IsoDate;
  description: string;
  amount: Minor;
  currency: string;
  direction: 'debit' | 'credit';
  kind: TransactionKind;
  installment: InstallmentInfo | null;
  category: string | null;
  merchant: string | null;
  source: 'statement' | 'manual';
}

export interface Statement extends StatementSummary {
  transactions: Transaction[];
  interest_rates: Record<string, string>;
}

export interface NewTransaction {
  date: IsoDate;
  description: string;
  amount: Minor;
  currency: string;
  direction: 'debit' | 'credit';
  installment: { total_count: number; amount_each: Minor } | null;
}

/**
 * Proposed extension (not in contract v0.1): split of one cash advance
 * installment into principal, interest and the two taxes. The UI shows it
 * when present. See the open question in the report.
 */
export interface InstallmentBreakdown {
  principal: Minor;
  interest: Minor;
  bsmv: Minor;
  kkdf: Minor;
}

export interface ScheduleItem {
  plan_id: string;
  description: string;
  amount: Minor;
  index: number;
  count: number;
  breakdown?: InstallmentBreakdown;
}

export interface ScheduleMonth {
  month: IsoMonth;
  total: Minor;
  items: ScheduleItem[];
}

export interface SchedulePlan {
  plan_id: string;
  description: string;
  kind: 'purchase' | 'cash_advance';
  remaining_count: number;
  amount_each: Minor;
  ends: IsoMonth;
  total_remaining: Minor;
  breakdown?: InstallmentBreakdown;
}

export interface Schedule {
  currency: string;
  months: ScheduleMonth[];
  plans: SchedulePlan[];
}

export interface CategoryShare {
  category: string;
  amount: Minor;
  share: Ratio;
}

export interface MonthlySummary {
  month: IsoMonth;
  currency: string;
  total_spend: Minor;
  total_credit: Minor;
  by_category: CategoryShare[];
  previous_month: { total_spend: Minor; change: Ratio } | null;
  statement_ids: string[];
}

export interface Subscription {
  merchant: string;
  amount_last: Minor;
  amount_previous: Minor;
  currency: string;
  months_seen: IsoMonth[];
  price_change: Ratio | null;
}

export interface Job {
  status: 'pending' | 'done' | 'failed';
  error: string | null;
}

export interface WatchItem {
  title: string;
  detail: string;
  transaction_ids: string[];
}

export interface Analysis {
  categories_applied: boolean;
  commentary: { locale: Locale; summary: string; watch_items: WatchItem[] };
  provider: ProviderId;
  created_at: string;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: Record<string, unknown> };
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: Record<string, unknown>;
  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface UploadOptions {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/** Everything the UI needs from the back end. Implemented by the HTTP client and the mock. */
export interface KalanApi {
  health(): Promise<{ status: string; version: string }>;
  getProviders(): Promise<ProvidersResponse>;
  selectProvider(id: ProviderId): Promise<ProvidersResponse>;
  getSettings(): Promise<Settings>;
  putSettings(settings: Settings): Promise<Settings>;
  uploadStatement(file: File, options?: UploadOptions): Promise<Statement>;
  listStatements(): Promise<{ items: StatementSummary[] }>;
  getStatement(id: string): Promise<Statement>;
  deleteStatement(id: string): Promise<void>;
  createTransaction(body: NewTransaction): Promise<Transaction>;
  deleteTransaction(id: string): Promise<void>;
  getSchedule(months: number): Promise<Schedule>;
  getMonthlySummary(month: IsoMonth): Promise<MonthlySummary>;
  getSubscriptions(): Promise<{ items: Subscription[] }>;
  analyzeStatement(id: string): Promise<{ job_id: string; status: 'pending' }>;
  getJob(jobId: string): Promise<Job>;
  getAnalysis(id: string): Promise<Analysis>;
}
