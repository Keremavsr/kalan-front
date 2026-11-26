// Types for the kalan API contract v0.3.0 (docs/api.md).
// Money is always integer minor units plus an ISO 4217 currency code.

export type Minor = number;
export type IsoDate = string; // YYYY-MM-DD
export type IsoMonth = string; // YYYY-MM
export type Ratio = string; // decimal as string, e.g. "0.20"
export type Percent = string; // percent per month as string, e.g. "3.08"

// -- health and setup ----------------------------------------------------------------------------

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

/** Languages the back end accepts in settings (`kalan.models.Locale`). The UI ships tr, en, es and pt. */
export type Locale = 'tr' | 'en' | 'es' | 'pt' | 'he';
/** The shareable card is drawn in Turkish or English only. */
export type CardLocale = 'tr' | 'en';

export interface Settings {
  locale: Locale;
  base_currency: string;
  months_ahead: number;
}

// -- statements -----------------------------------------------------------------------------------

export interface ReconciliationCheck {
  name: string;
  status: 'ok' | 'mismatch';
  expected: Minor;
  computed: Minor;
  difference: Minor;
}

export interface Reconciliation {
  status: 'ok' | 'mismatch';
  expected: Minor;
  computed: Minor;
  difference: Minor;
  /** Per-check results (back end extra, not in the contract text). */
  checks?: ReconciliationCheck[];
}

export type AnalysisStatus = 'none' | 'pending' | 'done' | 'failed';

/** Save-gate finding codes (contract "Save gate"). */
export type GateIssueCode =
  | 'duplicate_statement'
  | 'period_invalid'
  | 'due_before_cut_off'
  | 'no_transactions'
  | 'amount_scale'
  | 'period_unusual'
  | 'not_reconciled'
  | 'reconciliation_mismatch'
  | 'no_printed_summary'
  | 'rows_after_cut_off'
  | 'minimum_above_total'
  | 'installment_counter'
  | 'installment_sequence'
  | 'installment_missing';

export const HARD_GATE_CODES: readonly GateIssueCode[] = [
  'duplicate_statement',
  'period_invalid',
  'due_before_cut_off',
  'no_transactions',
  'amount_scale',
];

export interface GateIssue {
  code: GateIssueCode | (string & {});
  severity: 'hard' | 'soft';
  message: string;
  details: Record<string, number | string | string[] | null>;
}

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
  /**
   * The contract always shows an object; the back end model allows null (no reconciliation run,
   * save-gate finding `not_reconciled`). Screens should guard for it.
   */
  reconciliation: Reconciliation;
  analysis_status: AnalysisStatus;
  needs_review: boolean;
  /** Task 6: the card this statement belongs to and its display label ("Garanti Bonus ··1234"). */
  card_id?: string | null;
  card_label?: string | null;
  /** Soft save-gate findings; empty for a clean statement. */
  review: GateIssue[];
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

export type InstallmentComponent = 'principal' | 'bsmv' | 'kkdf' | 'interest' | 'early_payoff';

export interface InstallmentInfo {
  remaining_count: number;
  remaining_amount_each: Minor;
  is_last: boolean;
  plan_id: string;
  index: number | null;
  total_count: number | null;
  component: InstallmentComponent | null;
}

export type TransactionSource = 'statement' | 'manual' | 'import';

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
  source: TransactionSource;
  original_amount: Minor | null;
  original_currency: string | null;
  points: string | null;
  detail: string | null;
  /** v0.4.0: null for manual and imported rows. */
  card_id?: string | null;
  card_label?: string | null;
  category_source?: CategorySource | null;
  /** The merchant name was only an address; show "adı okunamayan işyeri". */
  merchant_unreadable?: boolean;
}

export type CategorySource = 'rule' | 'model' | 'user';

export interface PrintedSummary {
  previous_balance: Minor;
  period_transactions: Minor;
  interest_and_fees: Minor | null;
  payments: Minor;
  statement_total: Minor;
  remaining_installments: Minor | null;
}

export interface Statement extends StatementSummary {
  transactions: Transaction[];
  interest_rates: Record<string, string>;
  /** Bank parser id, template id or `ai-fallback`. */
  parser_id?: string | null;
  credit_limit?: Minor | null;
  next_period_end?: IsoDate | null;
  next_due_date?: IsoDate | null;
  printed_summary?: PrintedSummary | null;
  page_count?: number | null;
}

export const AI_FALLBACK_PARSER = 'ai-fallback';

export interface UploadOptions {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  /** Opens an encrypted PDF (max 200 characters). Never stored by the client. */
  password?: string;
  /** Store the password in the OS keyring for the statement's bank. */
  rememberPassword?: boolean;
  /** Query `ai_fallback`; the back end default is true. */
  aiFallback?: boolean;
}

export interface UploadResult {
  statement: Statement;
  /** Header `X-Kalan-Password-Remembered`; null when the header is absent (no remember asked). */
  passwordRemembered: boolean | null;
}

export interface TemplateDraft {
  provider: ProviderId;
  yaml: string;
  valid: boolean;
  errors: string[];
  detect: boolean;
  parse_error: string | null;
  reconciliation: Reconciliation | null;
}

export interface PdfPasswordHint {
  bank: string;
  hint: string;
}

export interface PdfPasswordItem {
  bank: string;
  hint: string | null;
  remembered: boolean;
}

export interface PdfPasswords {
  keyring: boolean;
  items: PdfPasswordItem[];
}

// -- categories -----------------------------------------------------------------------------------

export interface CategoryRule {
  id: string;
  pattern: string;
  category: string;
  created_at: string;
}

export interface CategoryRules {
  items: CategoryRule[];
  /** The allowed category list. */
  categories: string[];
}

export interface NewCategoryRule {
  pattern: string;
  category: string;
  /** Recategorise stored rows not categorised by hand; back end default true. */
  apply?: boolean;
}

export interface CategoryRuleCreated {
  rule: CategoryRule;
  applied: number;
}

// -- diagnosis ------------------------------------------------------------------------------------

export interface AnchorCount {
  found: number;
  total: number;
  missing: string[];
}

export interface DiagnosisTemplate {
  id: string;
  detected: boolean;
  anchors?: {
    detect_all: AnchorCount;
    detect_none_present: string[];
    header_fields: Record<string, boolean>;
    table_header: AnchorCount;
    table_end: boolean;
    summary_title: boolean;
  } | null;
}

export interface DiagnosisReport {
  kalan_version: string;
  page_count: number;
  has_text: boolean;
  line_count: number;
  lines_per_page: number[];
  number_styles: Record<string, number>;
  date_styles: Record<string, number>;
  templates: DiagnosisTemplate[];
  shapes: { page: number; shape: string; repeat: number }[];
  shapes_truncated: boolean;
}

export interface Diagnosis {
  report: DiagnosisReport;
  /** Plain-text report for the "bank not supported" issue form. */
  text: string;
}

export interface DiagnoseOptions {
  password?: string;
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
}

// -- imports --------------------------------------------------------------------------------------

export type ImportFormat = 'csv' | 'ofx' | 'qif';

export interface ImportMapping {
  date?: string;
  description?: string;
  amount?: string;
  debit?: string;
  credit?: string;
  installment?: string;
  currency_column?: string;
  currency?: string;
  delimiter?: string;
  decimal?: string;
  date_format?: string;
  sign?: 'negative_debit' | 'positive_debit';
  template?: string;
}

export interface ImportOptions {
  format?: ImportFormat;
  mapping?: ImportMapping;
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
}

export interface ImportDetected {
  delimiter?: string | null;
  decimal?: string | null;
  amount_format?: string | null;
  date_format?: string | null;
  date_ambiguous?: boolean;
  sign?: string | null;
  columns?: Record<string, string | null>;
  [key: string]: unknown;
}

export interface ImportSummary {
  id: string;
  format: ImportFormat;
  created_at: string;
  currency: string;
  detected: ImportDetected;
  months: IsoMonth[];
  rows: number;
  imported: number;
  skipped_duplicates: number;
}

export interface ImportResult extends Omit<ImportSummary, 'created_at'> {
  created_at?: string;
  /** Only the newly stored rows. */
  transactions: Transaction[];
}

// -- manual entry ---------------------------------------------------------------------------------

export interface NewTransaction {
  date: IsoDate;
  description: string;
  amount: Minor;
  currency: string;
  direction: 'debit' | 'credit';
  installment: { total_count: number; amount_each: Minor } | null;
}

export interface TransactionFilter {
  month?: IsoMonth;
  source?: TransactionSource;
}

// -- fixed costs ----------------------------------------------------------------------------------

export interface NewFixedCost {
  name: string;
  amount: Minor;
  /** Defaults to the base currency. */
  currency?: string | null;
  /** 1-31, clipped to short months. */
  day: number;
  start: IsoMonth;
  /** Inclusive; null = open ended. */
  end?: IsoMonth | null;
  category?: string | null;
}

export interface FixedCost {
  id: string;
  name: string;
  amount: Minor;
  currency: string;
  day: number;
  start: IsoMonth;
  end: IsoMonth | null;
  category: string | null;
}

// -- calculations ---------------------------------------------------------------------------------

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
  breakdown?: InstallmentBreakdown | null;
  card_id?: string | null;
  card_label?: string | null;
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
  breakdown?: InstallmentBreakdown | null;
  source?: TransactionSource;
  /** Back end extra, not in the contract text. */
  last_statement_id?: string | null;
  card_id?: string | null;
  card_label?: string | null;
  /** Task 6: the whole plan, for "3 taksitin 2'si ödendi, 1 kaldı". */
  total_count?: number | null;
  paid_count?: number | null;
  next_month?: IsoMonth | null;
  next_amount?: Minor | null;
  /** null: open. "user": the user said it is paid off. "statement": a newer statement shows it is gone. */
  closed?: PlanClosed | null;
  closed_at?: IsoDate | null;
  /** For `closed: "statement"`: the newer statement without the plan's row. */
  statement_id?: string | null;
}

export type PlanClosed = 'user' | 'statement';

/** Open plans only; computed by the back end. */
export interface ScheduleSummary {
  total_remaining: Minor;
  plan_count: number;
  last_month: IsoMonth | null;
}

export interface FixedScheduleItem {
  fixed_cost_id: string;
  name: string;
  amount: Minor;
  currency: string;
  date: IsoDate;
}

export interface FixedSchedule {
  kind: 'fixed';
  months: { month: IsoMonth; total: Minor; items: FixedScheduleItem[] }[];
}

export interface Schedule {
  currency: string;
  months: ScheduleMonth[];
  plans: SchedulePlan[];
  /** Recurring fixed costs over the same months; never added to `months[].total`. */
  fixed?: FixedSchedule;
  /** First schedule month (back end extra, not in the contract text). */
  start_month?: IsoMonth;
  summary?: ScheduleSummary;
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

export type RecurringKind = 'subscription' | 'bill';

export interface Subscription {
  /** Task 6: id for the expected amount and the cancel mark. */
  id?: string;
  kind?: RecurringKind;
  /** The amount the user said it changed to; null when not set. */
  expected_amount?: Minor | null;
  expected_since?: IsoDate | null;
  /** expected_amount when set, else amount_last. */
  monthly_amount?: Minor;
  last_date?: IsoDate;
  category?: string | null;
  card_id?: string | null;
  card_label?: string | null;
  merchant: string;
  amount_last: Minor;
  /** null when there is no earlier amount (v0.4.0). */
  amount_previous: Minor | null;
  currency: string;
  months_seen: IsoMonth[];
  price_change: Ratio | null;
}

export interface SimulationRequest {
  amount: Minor;
  count: number;
  start_month: IsoMonth;
  /** Percent per month; null = no interest. */
  interest_monthly?: Percent | null;
  months?: number | null;
}

export interface SimulatedInstallment {
  month: IsoMonth;
  amount: Minor;
  principal: Minor;
  interest: Minor;
}

export interface Simulation {
  currency: string;
  purchase: {
    amount: Minor;
    count: number;
    start_month: IsoMonth;
    interest_monthly: Percent | null;
    installments: SimulatedInstallment[];
    total_cost: Minor;
    interest_total: Minor;
    ends: IsoMonth;
  };
  months: { month: IsoMonth; without: Minor; purchase: Minor; with: Minor }[];
  peak: { without: { month: IsoMonth; total: Minor }; with: { month: IsoMonth; total: Minor } };
}

// -- alerts ---------------------------------------------------------------------------------------

export type AlertKind =
  | 'installment_ending'
  | 'limit_high'
  | 'interest_charged'
  | 'fee_charged'
  | 'tax_charged'
  | 'foreign_currency'
  | 'missing_statement'
  | 'subscription_price_rise'
  | 'due_soon'
  | 'statement_overdue'
  | 'charged_after_cancel';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface Alert {
  id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  month: IsoMonth;
  /** `alert.<kind>`; the front end translates it with `params`. */
  message_key: string;
  params: Record<string, string | number | string[] | null>;
  refs: { statement_ids: string[]; transaction_ids: string[]; plan_ids: string[] };
  card_id?: string | null;
  card_label?: string | null;
  /** v0.4.0: the back end's sentence in tr/en; set for missing_statement. */
  text?: string | null;
}

export interface SubscriptionsResponse {
  items: Subscription[];
  /** v0.4.0: monthly_amount added up per kind. */
  totals?: { currency: string; subscription: Minor; bill: Minor }[];
}

// -- model analysis -------------------------------------------------------------------------------

export interface Job {
  status: 'pending' | 'done' | 'failed';
  error: string | null;
  /** v0.4.0 */
  job_id?: string;
  kind?: 'statement' | 'analysis_all';
  statement_id?: string | null;
  phase?: AnalysisPhase | null;
  done?: number;
  total?: number;
  failed?: number;
}

export type AnalysisPhase = 'statements' | 'suggestions' | 'done';

/** The batch over every statement not yet read, then AI suggestions (POST /analysis/all). */
export interface AnalysisRun extends Job {
  job_id: string;
}

// -- cards and suggestions (task 6) -----------------------------------------------------------------

export interface CardInfo {
  id: string;
  bank: string;
  bank_name: string;
  product: string | null;
  card_last4: string;
  /** The name the user gave; null when not named. */
  name: string | null;
  /** What screens show: "<name> ··0000", else "<bank> <product> ··0000". */
  label: string;
  statement_count: number;
  first_month: IsoMonth;
  last_month: IsoMonth;
  latest_statement_id: string;
}

export type SuggestionSource = 'rules' | 'ai';

export type SuggestionKind =
  | 'duplicate_service'
  | 'price_rise'
  | 'card_fee'
  | 'interest'
  | 'foreign_currency'
  | 'frequent_place'
  | 'installment_relief'
  | 'ai';

export interface Suggestion {
  id: string;
  kind: SuggestionKind | (string & {});
  title: string;
  body: string;
  monthly_saving: Minor | null;
  yearly_saving: Minor | null;
  currency: string;
  card_id: string | null;
  card_label: string | null;
  source: SuggestionSource;
  /** In-app path, e.g. "/recurring?id=sb_..". */
  link: string | null;
  message_key: string | null;
  params: Record<string, unknown>;
}

export interface SuggestionsResponse {
  items: Suggestion[];
  ai: { status: AnalysisStatus; provider: ProviderId | null; created_at: string | null; job_id: string | null };
}

export interface FrequentPlace {
  merchant: string;
  kind: 'frequent_place';
  category: string | null;
  months_seen: number;
  visits: number;
  total: Minor;
  monthly_average: Minor;
  last_date: IsoDate;
  card_ids: string[];
}

export interface FrequentPlaces {
  currency: string;
  window: { months: IsoMonth[]; count: number };
  items: FrequentPlace[];
}

export interface CardParts {
  installments: Minor;
  subscriptions: Minor;
  other: Minor;
}

/** One card's row under "Bu ay ödeyeceklerin": its next unpaid due payment. */
export interface ForecastCard {
  card_id: string;
  card_label: string;
  bank: string;
  card_last4: string;
  due_date: IsoDate;
  amount: Minor;
  /** true: the forecast of the next statement. false: the stored statement's printed total. */
  estimated: boolean;
  statement_id: string | null;
  minimum_payment: Minor | null;
  days_left: number;
  parts: CardParts | null;
  next_statement: {
    month: IsoMonth;
    cut_off: IsoDate;
    due_date: IsoDate;
    dates: 'printed' | 'estimated';
    total: Minor;
    parts: CardParts;
    installment_items: ScheduleItem[];
    subscriptions: { id: string; merchant: string; amount: Minor }[];
    note: string;
    note_key: string;
    note_params: Record<string, string | number>;
  } | null;
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

// -- insights -------------------------------------------------------------------------------------

export interface RuleOverrides {
  contractual_monthly: Percent | null;
  late_monthly: Percent | null;
  bsmv: Ratio | null;
  kkdf: Ratio | null;
  minimum_ratio: Ratio | null;
}

export interface InsightRules {
  /** Contents of `tr_card_rules.json` (dated, sourced values). */
  rules: Record<string, unknown>;
  overrides: RuleOverrides;
}

export type ValueSource = 'override' | 'statement' | 'rules' | 'assumption';

export interface SourcedValue {
  value: string;
  source: ValueSource;
  detail: string | null;
}

export interface Assumption {
  key: string;
  text: string;
}

export interface MinimumPaymentQuery {
  statement_id?: string;
  include_installments?: boolean;
  cycles?: number;
}

export interface MinimumPaymentCycle {
  cycle: number;
  cut_off: IsoDate;
  balance: Minor;
  payment: Minor;
  unpaid: Minor;
  days: number;
  interest: Minor;
  bsmv: Minor;
  kkdf: Minor;
  added: Minor;
  next_balance: Minor;
}

export interface MinimumPaymentPlan {
  statement_id: string;
  currency: string;
  start_balance: Minor;
  minimum_only: {
    cycles: number;
    paid_off: boolean;
    last_payment_cut_off: IsoDate | null;
    total_paid: Minor;
    interest: Minor;
    bsmv: Minor;
    kkdf: Minor;
    cost: Minor;
    balance_left: Minor;
  };
  pay_in_full: { total_paid: Minor; cost: Minor };
  extra_cost: Minor;
  rates: {
    contractual_monthly: { from_cycle: number; monthly: Percent; source: ValueSource; detail: string | null }[];
    bsmv: SourcedValue;
    kkdf: SourcedValue;
    minimum_ratio: SourcedValue;
  };
  assumptions: Assumption[];
  cycles: MinimumPaymentCycle[];
}

export interface CardFee {
  transaction_id: string;
  statement_id: string;
  date: IsoDate;
  description: string;
  amount: Minor;
  currency: string;
  bank: string;
  product: string;
  card_last4: string;
  statement_period_end: IsoDate;
  supplementary_card: boolean;
  refunded: boolean;
}

export type RefundRoute = 'hakem_heyeti' | 'consumer_court';

export interface LegalBasis {
  id: string;
  title: string;
  summary: string;
  source: string;
  verified: boolean | string;
}

export interface CardFeePrompt {
  fee: CardFee;
  route: RefundRoute;
  hakem_heyeti: { year: number; limit_below: Minor; currency: string; source: string; apply: string };
  legal_basis: LegalBasis[];
  placeholders: string[];
  prompt: string;
  note: string;
}

export interface CardFeeDraft {
  provider: ProviderId;
  text: string;
  route: RefundRoute;
  placeholders_kept: string[];
  placeholders_missing: string[];
}

export interface CardOption {
  /** v0.4.0 */
  card_id?: string;
  card_label?: string;
  bank: string;
  product: string;
  card_last4: string;
  statement_id: string;
  cut_off: IsoDate;
  cut_off_day: number;
  due_offset_days: number;
  due_date: IsoDate;
  due_date_effective: IsoDate;
  shifted_days: number;
  interest_free_days: number;
  days_until_cut_off: number;
  first_installment_month: IsoMonth;
  basis: 'printed' | 'projected';
  stale: boolean;
}

export interface WhichCard {
  date: IsoDate;
  best: CardOption | null;
  cards: CardOption[];
  assumptions: Assumption[];
}

export interface ShareCardQuery {
  locale?: CardLocale;
  amounts?: boolean;
}

export interface ShareCard {
  locale: CardLocale;
  show_amounts: boolean;
  sentence: string;
  /** `total` only with `amounts=true`. */
  months: { month: IsoMonth; share: Ratio; total?: Minor }[];
  /** Only with `amounts=true`. */
  currency?: string;
  svg: string;
}

export interface ForecastPartsMap {
  installments: Minor;
  subscriptions: Minor;
  variable: Minor;
  fixed: Minor;
}

export interface BacktestSummary {
  currency: string;
  count: number;
  mae: Minor | null;
  mape: Ratio | null;
  bias: Minor | null;
  min_history: number;
}

export interface Forecast {
  open_period: {
    /** null when no statement is stored yet. */
    from: IsoDate | null;
    to: IsoDate;
    transactions: Transaction[];
    debit_total: Minor;
    credit_total: Minor;
  };
  forecast: {
    month: IsoMonth;
    currency: string;
    total: Minor;
    parts: ForecastPartsMap;
    include_fixed: boolean;
    variable_basis: { months: IsoMonth[]; median: Minor; known_in_month: Minor };
    installment_items: ScheduleItem[];
    subscriptions: { merchant: string; amount: Minor }[];
  } | null;
  backtest: BacktestSummary;
  /** v0.4.0: what to pay next, card by card; `total` adds the rows, `fixed` is not in it. */
  currency?: string;
  total?: Minor;
  fixed?: Minor;
  cards?: ForecastCard[];
}

export interface BacktestQuery {
  include_fixed?: boolean;
  history?: number;
  min_history?: number;
}

export interface Backtest extends BacktestSummary {
  months: { month: IsoMonth; forecast: Minor; actual: Minor; error: Minor; parts: ForecastPartsMap }[];
}

export interface Payoff {
  plan_id: string;
  description: string;
  kind: 'purchase' | 'cash_advance';
  source: TransactionSource;
  currency: string;
  payoff_month: IsoMonth;
  remaining_count: number;
  amount_each: Minor;
  remaining_total: Minor;
  discount_rule: 'unknown';
  note: string;
  breakdown: InstallmentBreakdown | null;
  remaining_principal: Minor | null;
  would_save_if_future_interest_dropped: Minor | null;
  schedule_effect: { month: IsoMonth; without: Minor; with: Minor }[];
}

export interface ClosedEarly {
  plan_id: string;
  statement_id: string;
  month: IsoMonth;
  transaction_id: string;
  index: number | null;
  total_count: number | null;
}

export interface EarlyPayoffOverview {
  currency: string;
  start_month: IsoMonth;
  plans: Payoff[];
  closed_early: ClosedEarly[];
}

export interface CancelledSubscription {
  merchant: string;
  cancelled_on: IsoDate;
}

export interface FixedCostMatch {
  fixed_cost_id: string;
  month: IsoMonth;
  transaction_id: string;
  date: IsoDate;
  amount: Minor;
  amount_diff: Minor;
  day_diff: number;
}

export interface FixedCostMatches {
  tolerance: { amount: Ratio; days: number };
  costs: {
    fixed_cost_id: string;
    name: string;
    amount: Minor;
    currency: string;
    day: number;
    matches: FixedCostMatch[];
    missing_months: IsoMonth[];
  }[];
  duplicates: { fixed_cost_ids: string[]; same_name: boolean; amount_diff: Minor; day_gap: number }[];
}

export type ExportFormat = 'hledger' | 'beancount' | 'ofx' | 'csv';

export interface ExportQuery {
  format: ExportFormat;
  what?: 'transactions' | 'plans';
  currency?: string;
}

export interface ExportFile {
  text: string;
  /** From `Content-Disposition`, else `kalan-<what>.<ext>`. */
  filename: string;
  contentType: string;
  /** `X-Kalan-Skipped-Rows`; null when the header cannot be read. */
  skippedRows: number | null;
}

// -- errors ---------------------------------------------------------------------------------------

export type AiFallbackReason = 'off' | 'no_provider' | 'provider_unavailable' | 'too_long';

/** `details` per error code, as far as the contract and back end define them. */
export interface ErrorDetailsByCode {
  duplicate: { statement_id: string };
  save_blocked: { issues: GateIssue[] };
  pdf_password_required: { hints: PdfPasswordHint[] };
  pdf_password_wrong: { hints: PdfPasswordHint[] };
  unknown_format: { ai_fallback: AiFallbackReason };
  ai_fallback_failed: { provider: ProviderId };
  provider_failed: { provider: ProviderId };
  provider_unavailable: { id?: ProviderId; detail?: string };
  unknown_provider: { known: string[] };
  file_too_large: { max_bytes?: number };
  duplicate_rule: { rule_id: string };
  unknown_bank: { known: string[] };
  statement_not_found: { id: string };
  transaction_not_found: { id: string };
  import_not_found: { id: string };
  job_not_found: { id: string };
  card_fee_not_found: { id: string };
  plan_not_found: { id: string };
  month_outside_schedule: { start_month: IsoMonth; months: number };
  validation_error: { errors: { loc: (string | number)[]; msg: string }[] };
}

/** Codes without `details`. */
export type PlainErrorCode =
  | 'not_found'
  | 'analysis_not_found'
  | 'not_manual'
  | 'invalid_installment'
  | 'not_pdf'
  | 'invalid_pdf'
  | 'parse_error'
  | 'no_provider'
  | 'no_statement_text'
  | 'keyring_unavailable'
  | 'not_remembered'
  | 'invalid_pattern'
  | 'import_unreadable'
  | 'invalid_mapping'
  | 'invalid_period'
  | 'fixed_cost_not_found'
  | 'no_statements'
  | 'cancellation_not_found'
  | 'plans_csv_only'
  | 'analysis_failed'
  | 'bad_request'
  | 'method_not_allowed'
  | 'unsupported_media_type'
  | 'http_error'
  // v0.4.0
  | 'card_not_found'
  | 'plan_not_found'
  | 'closed_by_statement'
  | 'plan_not_closed'
  | 'subscription_not_found'
  | 'expected_not_set'
  // client side only
  | 'network'
  | 'aborted'
  | 'invalid_response';

export type KnownErrorCode = keyof ErrorDetailsByCode | PlainErrorCode;
export type ApiErrorCode = KnownErrorCode | (string & {});

export type ErrorDetails<C extends ApiErrorCode> = C extends keyof ErrorDetailsByCode
  ? ErrorDetailsByCode[C]
  : Record<string, unknown>;

export interface ApiErrorBody {
  error: { code: string; message: string; details?: Record<string, unknown> };
}

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown>;
  constructor(status: number, code: ApiErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Narrows an unknown error to an ApiError with `code`, typing its `details`. */
export function isApiError<C extends KnownErrorCode>(
  error: unknown,
  code: C,
): error is ApiError & { code: C; details: ErrorDetails<C> } {
  return error instanceof ApiError && error.code === code;
}

// -- the client -----------------------------------------------------------------------------------

/** Everything the UI needs from the back end. Implemented by the HTTP client and the mock. */
export interface KalanApi {
  // health and setup
  health(): Promise<{ status: string; version: string }>;
  getProviders(): Promise<ProvidersResponse>;
  selectProvider(id: ProviderId): Promise<ProvidersResponse>;
  getSettings(): Promise<Settings>;
  putSettings(settings: Settings): Promise<Settings>;

  // statements
  /** `POST /statements`; resolves to the statement only. */
  uploadStatement(file: File, options?: UploadOptions): Promise<Statement>;
  /** `POST /statements` with the `X-Kalan-Password-Remembered` answer. */
  uploadStatementDetailed(file: File, options?: UploadOptions): Promise<UploadResult>;
  listStatements(): Promise<{ items: StatementSummary[] }>;
  getStatement(id: string): Promise<Statement>;
  deleteStatement(id: string): Promise<void>;
  createTemplateDraft(statementId: string): Promise<TemplateDraft>;
  getPdfPasswords(): Promise<PdfPasswords>;
  putPdfPassword(bank: string, password: string): Promise<void>;
  deletePdfPassword(bank: string): Promise<void>;

  // categories and diagnosis
  getCategoryRules(): Promise<CategoryRules>;
  createCategoryRule(body: NewCategoryRule): Promise<CategoryRuleCreated>;
  deleteCategoryRule(id: string): Promise<void>;
  diagnose(file: File, options?: DiagnoseOptions): Promise<Diagnosis>;

  // imports
  importFile(file: File, options?: ImportOptions): Promise<ImportResult>;
  listImports(): Promise<{ items: ImportSummary[] }>;
  deleteImport(id: string): Promise<void>;

  // manual entry
  createTransaction(body: NewTransaction): Promise<Transaction>;
  listTransactions(filter?: TransactionFilter): Promise<{ items: Transaction[] }>;
  deleteTransaction(id: string): Promise<void>;

  // fixed costs
  createFixedCost(body: NewFixedCost): Promise<FixedCost>;
  listFixedCosts(): Promise<{ items: FixedCost[] }>;
  deleteFixedCost(id: string): Promise<void>;

  // calculations
  getSchedule(months: number): Promise<Schedule>;
  getMonthlySummary(month: IsoMonth): Promise<MonthlySummary>;
  getSubscriptions(): Promise<SubscriptionsResponse>;
  simulateInstallment(body: SimulationRequest): Promise<Simulation>;
  getAlerts(): Promise<{ items: Alert[] }>;

  // model analysis
  analyzeStatement(id: string): Promise<{ job_id: string; status: 'pending' }>;
  getJob(jobId: string): Promise<Job>;
  getAnalysis(id: string): Promise<Analysis>;
  /** Reads every statement not yet read, then writes suggestions. */
  startAnalysisAll(): Promise<{ job_id: string; kind: 'analysis_all'; status: 'pending'; total: number }>;
  /** The latest run over every statement, or null. */
  getAnalysisAll(): Promise<AnalysisRun | null>;

  // cards, plans, suggestions (task 6)
  listCards(): Promise<{ items: CardInfo[] }>;
  renameCard(id: string, name: string | null): Promise<CardInfo>;
  closePlan(planId: string): Promise<SchedulePlan>;
  reopenPlan(planId: string): Promise<void>;
  setSubscriptionExpected(id: string, amount: Minor): Promise<Subscription>;
  clearSubscriptionExpected(id: string): Promise<void>;
  getSuggestions(locale?: string): Promise<SuggestionsResponse>;
  getFrequentPlaces(months?: number): Promise<FrequentPlaces>;

  // insights
  getInsightRules(): Promise<InsightRules>;
  putInsightRules(overrides: Partial<RuleOverrides>): Promise<InsightRules>;
  getMinimumPayment(query?: MinimumPaymentQuery): Promise<MinimumPaymentPlan>;
  listCardFees(): Promise<{ items: CardFee[] }>;
  getCardFeePrompt(transactionId: string): Promise<CardFeePrompt>;
  draftCardFeeLetter(transactionId: string): Promise<CardFeeDraft>;
  getWhichCard(date?: IsoDate): Promise<WhichCard>;
  getShareCard(query?: ShareCardQuery): Promise<ShareCard>;
  getShareCardSvg(query?: ShareCardQuery): Promise<string>;
  getForecast(includeFixed?: boolean): Promise<Forecast>;
  getForecastBacktest(query?: BacktestQuery): Promise<Backtest>;
  getEarlyPayoffOverview(): Promise<EarlyPayoffOverview>;
  getEarlyPayoff(planId: string, month?: IsoMonth): Promise<Payoff>;
  listCancelledSubscriptions(): Promise<{ items: CancelledSubscription[] }>;
  addCancelledSubscription(body: CancelledSubscription): Promise<{ items: CancelledSubscription[] }>;
  deleteCancelledSubscription(merchant: string): Promise<void>;
  getFixedCostMatches(): Promise<FixedCostMatches>;
  exportData(query: ExportQuery): Promise<ExportFile>;
}
