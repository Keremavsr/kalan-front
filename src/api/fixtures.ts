// Invented demo data. Card 0000, bank "ornekbank", merchants with -ORNEK suffix.
// No real person, card or statement is behind any of this.
import type {
  Analysis,
  GateIssue,
  InstallmentBreakdown,
  Locale,
  Provider,
  ProviderId,
  Settings,
  Statement,
  Transaction,
  TransactionKind,
} from './types';

const tl = (value: number) => Math.round(value * 100);

export interface RawTx {
  date: string;
  description: string;
  amount: number;
  kind: TransactionKind;
  category: string | null;
  merchant?: string | null;
  direction?: 'debit' | 'credit';
  installment?: { remaining_count: number; each: number; plan_id: string; component?: 'principal' };
  original?: { amount: number; currency: string };
}

/** Plan lengths of the invented plans; index = length - remaining count. */
export const PLAN_COUNTS: Record<string, number> = { pl_01: 3, pl_02: 12, pl_03: 6, pl_k2_01: 3, pl_ai_01: 4 };

export function buildTransactions(prefix: string, rows: RawTx[]): Transaction[] {
  return rows.map((row, i) => ({
    id: `tx_${prefix}_${String(i + 1).padStart(2, '0')}`,
    date: row.date,
    description: row.description,
    amount: tl(row.amount),
    currency: 'TRY',
    direction: row.direction ?? (row.kind === 'payment' || row.kind === 'refund' ? 'credit' : 'debit'),
    kind: row.kind,
    installment: row.installment
      ? {
          remaining_count: row.installment.remaining_count,
          remaining_amount_each: tl(row.installment.each),
          is_last: row.installment.remaining_count === 0,
          plan_id: row.installment.plan_id,
          index: PLAN_COUNTS[row.installment.plan_id]
            ? PLAN_COUNTS[row.installment.plan_id]! - row.installment.remaining_count
            : null,
          total_count: PLAN_COUNTS[row.installment.plan_id] ?? null,
          component: row.installment.component ?? null,
        }
      : null,
    category: row.category,
    merchant: row.merchant === undefined ? null : row.merchant,
    source: 'statement',
    original_amount: row.original ? tl(row.original.amount) : null,
    original_currency: row.original?.currency ?? null,
    points: null,
    detail: null,
  }));
}

/** Spend counted for reconciliation: debits minus refunds, payments and carry-over excluded. */
export function computeStatementTotal(transactions: Transaction[]): number {
  return transactions.reduce((sum, tx) => {
    if (tx.kind === 'payment' || tx.kind === 'carry_over') return sum;
    return tx.direction === 'debit' ? sum + tx.amount : sum - tx.amount;
  }, 0);
}

export type StatementBase = Omit<
  Statement,
  'transactions' | 'statement_total' | 'reconciliation' | 'minimum_payment' | 'needs_review' | 'review'
> &
  Partial<Pick<Statement, 'needs_review' | 'review'>>;

export function buildStatement(base: StatementBase, transactions: Transaction[], printedDifference = 0): Statement {
  const computed = computeStatementTotal(transactions);
  const expected = computed + printedDifference;
  const review: GateIssue[] =
    base.review ??
    (printedDifference === 0
      ? []
      : [
          {
            code: 'reconciliation_mismatch',
            severity: 'soft',
            message: 'Rows do not add up to the printed totals.',
            details: { difference: printedDifference, checks: ['statement_total'] },
          },
        ]);
  return {
    ...base,
    needs_review: base.needs_review ?? review.length > 0,
    review,
    statement_total: expected,
    minimum_payment: Math.round((expected * 0.2) / 100) * 100,
    reconciliation: {
      status: printedDifference === 0 ? 'ok' : 'mismatch',
      expected,
      computed,
      difference: expected - computed,
    },
    transactions,
  };
}

const RATES = { purchase_monthly: '3.25', cash_advance_monthly: '4.25', late_monthly: '3.55' };

const STATEMENT_BASE = {
  bank: 'ornekbank',
  product: 'Örnek Kart',
  card_last4: '0000',
  currency: 'TRY',
  interest_rates: RATES,
  parser_id: 'tr_ornekbank_kart',
  credit_limit: tl(17500),
  page_count: 2,
} as const;

export const CASH_ADVANCE_BREAKDOWN: InstallmentBreakdown = {
  principal: tl(3000),
  interest: tl(382.5),
  bsmv: tl(57.38),
  kkdf: tl(57.38),
};

export const PLAN_BREAKDOWNS: Record<string, InstallmentBreakdown> = { pl_01: CASH_ADVANCE_BREAKDOWN };

export const PLAN_KINDS: Record<string, 'purchase' | 'cash_advance'> = {
  pl_01: 'cash_advance',
  pl_02: 'purchase',
  pl_03: 'purchase',
};

export const statement08 = buildStatement(
  { ...STATEMENT_BASE, id: 'st_08', period_start: '2026-07-26', period_end: '2026-08-25', due_date: '2026-09-04', analysis_status: 'none' },
  buildTransactions('08', [
    { date: '2026-07-26', description: 'Önceki dönem bakiyesi', amount: 6120, kind: 'carry_over', category: null },
    { date: '2026-07-29', description: 'MIGROS-ORNEK ISTANBUL', amount: 1540.75, kind: 'purchase', category: 'groceries', merchant: 'MIGROS-ORNEK' },
    { date: '2026-07-31', description: 'STREAMFLIX.COM', amount: 149.99, kind: 'purchase', category: 'subscriptions', merchant: 'STREAMFLIX' },
    { date: '2026-08-02', description: 'MUZIKBOX ABONELIK', amount: 59.99, kind: 'purchase', category: 'subscriptions', merchant: 'MUZIKBOX' },
    { date: '2026-08-05', description: 'Ödeme, teşekkür ederiz', amount: 6120, kind: 'payment', category: null },
    { date: '2026-08-07', description: 'AKARYAKIT-ORNEK', amount: 1420, kind: 'purchase', category: 'transport', merchant: 'AKARYAKIT-ORNEK' },
    { date: '2026-08-11', description: 'TATIL-ORNEK OTEL', amount: 3100, kind: 'purchase', category: 'travel', merchant: 'TATIL-ORNEK' },
    { date: '2026-08-15', description: 'ELEKTRO-ORNEK DIZUSTU 2/12', amount: 2000, kind: 'installment', category: 'electronics', merchant: 'ELEKTRO-ORNEK', installment: { remaining_count: 10, each: 2000, plan_id: 'pl_02' } },
    { date: '2026-08-19', description: 'KAFE-ORNEK', amount: 164.5, kind: 'purchase', category: 'dining', merchant: 'KAFE-ORNEK' },
    { date: '2026-08-22', description: 'MIGROS-ORNEK ISTANBUL', amount: 980.4, kind: 'purchase', category: 'groceries', merchant: 'MIGROS-ORNEK' },
  ]),
);

export const statement09 = buildStatement(
  { ...STATEMENT_BASE, id: 'st_09', period_start: '2026-08-26', period_end: '2026-09-25', due_date: '2026-10-05', analysis_status: 'done' },
  buildTransactions('09', [
    { date: '2026-08-26', description: 'Önceki dönem bakiyesi', amount: 9415.63, kind: 'carry_over', category: null },
    { date: '2026-08-28', description: 'MIGROS-ORNEK ISTANBUL', amount: 1890.2, kind: 'purchase', category: 'groceries', merchant: 'MIGROS-ORNEK' },
    { date: '2026-08-31', description: 'STREAMFLIX.COM', amount: 149.99, kind: 'purchase', category: 'subscriptions', merchant: 'STREAMFLIX' },
    { date: '2026-09-02', description: 'MUZIKBOX ABONELIK', amount: 59.99, kind: 'purchase', category: 'subscriptions', merchant: 'MUZIKBOX' },
    { date: '2026-09-03', description: 'BULUTDEPO AYLIK', amount: 39.99, kind: 'purchase', category: 'subscriptions', merchant: 'BULUTDEPO' },
    { date: '2026-09-04', description: 'Ödeme, teşekkür ederiz', amount: 9415.63, kind: 'payment', category: null },
    { date: '2026-09-06', description: 'AKARYAKIT-ORNEK', amount: 1600, kind: 'purchase', category: 'transport', merchant: 'AKARYAKIT-ORNEK' },
    { date: '2026-09-10', description: 'KAFE-ORNEK', amount: 198, kind: 'purchase', category: 'dining', merchant: 'KAFE-ORNEK' },
    { date: '2026-09-15', description: 'ELEKTRO-ORNEK DIZUSTU 3/12', amount: 2000, kind: 'installment', category: 'electronics', merchant: 'ELEKTRO-ORNEK', installment: { remaining_count: 9, each: 2000, plan_id: 'pl_02' } },
    { date: '2026-09-18', description: 'MOBILYA-ORNEK KITAPLIK 1/6', amount: 1500, kind: 'installment', category: 'home', merchant: 'MOBILYA-ORNEK', installment: { remaining_count: 5, each: 1500, plan_id: 'pl_03' } },
    { date: '2026-09-21', description: 'KITAP-ORNEK', amount: 245, kind: 'purchase', category: 'education', merchant: 'KITAP-ORNEK' },
  ]),
);

/** The statement the mock "parses" on first upload. Its printed total is 149,99 TL above what was read. */
export const statement10 = buildStatement(
  {
    ...STATEMENT_BASE,
    id: 'st_10',
    period_start: '2026-09-26',
    period_end: '2026-10-25',
    due_date: '2026-11-04',
    analysis_status: 'none',
    next_period_end: '2026-11-25',
    next_due_date: '2026-12-04',
  },
  buildTransactions('10', [
    { date: '2026-09-26', description: 'Önceki dönem bakiyesi', amount: 7683.17, kind: 'carry_over', category: null },
    { date: '2026-09-27', description: 'MIGROS-ORNEK ISTANBUL', amount: 1245.6, kind: 'purchase', category: 'groceries', merchant: 'MIGROS-ORNEK' },
    { date: '2026-09-30', description: 'STREAMFLIX.COM', amount: 179.99, kind: 'purchase', category: 'subscriptions', merchant: 'STREAMFLIX', original: { amount: 5, currency: 'USD' } },
    { date: '2026-10-02', description: 'MUZIKBOX ABONELIK', amount: 59.99, kind: 'purchase', category: 'subscriptions', merchant: 'MUZIKBOX' },
    { date: '2026-10-03', description: 'BULUTDEPO AYLIK', amount: 39.99, kind: 'purchase', category: 'subscriptions', merchant: 'BULUTDEPO' },
    { date: '2026-10-05', description: 'Ödeme, teşekkür ederiz', amount: 7683.17, kind: 'payment', category: null },
    { date: '2026-10-06', description: 'AKARYAKIT-ORNEK', amount: 1850, kind: 'purchase', category: 'transport', merchant: 'AKARYAKIT-ORNEK' },
    { date: '2026-10-09', description: 'KAFE-ORNEK', amount: 286.5, kind: 'purchase', category: 'dining', merchant: 'KAFE-ORNEK' },
    { date: '2026-10-12', description: 'MIGROS-ORNEK ISTANBUL', amount: 2104.35, kind: 'purchase', category: 'groceries', merchant: 'MIGROS-ORNEK' },
    { date: '2026-10-14', description: 'Mobil taksitli nakit avans 1/3', amount: 3000, kind: 'cash_advance', category: 'cash_advance', installment: { remaining_count: 2, each: 3497.26, plan_id: 'pl_01', component: 'principal' } },
    { date: '2026-10-14', description: 'Nakit avans faizi', amount: 382.5, kind: 'interest', category: 'interest_tax' },
    { date: '2026-10-14', description: 'BSMV', amount: 57.38, kind: 'tax', category: 'interest_tax' },
    { date: '2026-10-14', description: 'KKDF', amount: 57.38, kind: 'tax', category: 'interest_tax' },
    { date: '2026-10-15', description: 'ELEKTRO-ORNEK DIZUSTU 4/12', amount: 2000, kind: 'installment', category: 'electronics', merchant: 'ELEKTRO-ORNEK', installment: { remaining_count: 8, each: 2000, plan_id: 'pl_02' } },
    { date: '2026-10-18', description: 'MOBILYA-ORNEK KITAPLIK 2/6', amount: 1500, kind: 'installment', category: 'home', merchant: 'MOBILYA-ORNEK', installment: { remaining_count: 4, each: 1500, plan_id: 'pl_03' } },
    { date: '2026-10-18', description: 'ECZANE-ORNEK', amount: 312.4, kind: 'purchase', category: 'health', merchant: 'ECZANE-ORNEK' },
    { date: '2026-10-20', description: 'İade MIGROS-ORNEK', amount: 145, kind: 'refund', category: 'groceries', merchant: 'MIGROS-ORNEK' },
    { date: '2026-10-22', description: 'Yıllık kart aidatı', amount: 1234.56, kind: 'fee', category: 'fees' },
    { date: '2026-10-23', description: 'RESTORAN-ORNEK', amount: 740, kind: 'purchase', category: 'dining', merchant: 'RESTORAN-ORNEK' },
  ]),
  tl(149.99),
);

export const providers: Provider[] = [
  { id: 'claude-cli', name: 'Claude Code', available: true, detail: 'claude 2.4.1 found on PATH' },
  { id: 'codex-cli', name: 'Codex CLI', available: true, detail: 'codex 0.98.0 found on PATH' },
  { id: 'gemini-cli', name: 'Gemini CLI', available: false, detail: 'gemini not found on PATH' },
  { id: 'agy-cli', name: 'Antigravity CLI', available: false, detail: 'agy not found on PATH' },
  { id: 'openai-compatible', name: 'OpenAI-compatible endpoint', available: false, detail: 'no base URL configured' },
  { id: 'local', name: 'Local model server', available: false, detail: 'nothing listening on 127.0.0.1:11434' },
];

export const defaultSettings: Settings = { locale: 'tr', base_currency: 'TRY', months_ahead: 12 };

type AnalysisText = Record<Locale, Analysis['commentary']>;

export const analysisTexts: Record<string, AnalysisText> = {
  st_09: {
    tr: {
      locale: 'tr',
      summary:
        'Eylül harcaması 7.683,17 TL. Bunun 3.500,00 TL’si iki taksit planından geliyor. Akaryakıt bir önceki aya göre arttı, market azaldı; diğer kalemler aynı düzeyde.',
      watch_items: [
        {
          title: 'Yeni bir taksit planı başladı',
          detail: 'MOBILYA-ORNEK alışverişi altı taksit. İlk taksit bu ekstrede, son taksit Şubat 2027’de. Bu plan her ay 1.500,00 TL bağlıyor.',
          transaction_ids: ['tx_09_10'],
        },
        {
          title: 'Akaryakıt harcaması arttı',
          detail: 'AKARYAKIT-ORNEK harcaması Ağustos’ta 1.420,00 TL idi, Eylül’de 1.600,00 TL oldu.',
          transaction_ids: ['tx_09_07'],
        },
      ],
    },
    en: {
      locale: 'en',
      summary:
        'September spend is TRY 7,683.17. TRY 3,500.00 of it comes from two installment plans. Fuel rose against the previous month and groceries fell; everything else held steady.',
      watch_items: [
        {
          title: 'A new installment plan started',
          detail: 'The MOBILYA-ORNEK purchase is split into six installments. The first is on this statement, the last in February 2027. It commits TRY 1,500.00 each month.',
          transaction_ids: ['tx_09_10'],
        },
        {
          title: 'Fuel spend went up',
          detail: 'AKARYAKIT-ORNEK was TRY 1,420.00 in August and TRY 1,600.00 in September.',
          transaction_ids: ['tx_09_07'],
        },
      ],
    },
  },
  st_10: {
    tr: {
      locale: 'tr',
      summary:
        'Ekim ekstresinde iki taksit planına ek olarak üç taksitli bir nakit avans var. Kasım ve Aralık’ta taksitler için ayda 6.997,26 TL ayrılmış durumda; Ocak’tan itibaren bu tutar 3.500,00 TL’ye iniyor.',
      watch_items: [
        {
          title: 'Nakit avansın iki taksiti kaldı',
          detail: 'Her taksit 3.497,26 TL. Bunun 497,26 TL’si faiz, BSMV ve KKDF. Erken kapatmanın faizi ne kadar azaltacağını bankanıza sorabilirsiniz.',
          transaction_ids: ['tx_10_10', 'tx_10_11', 'tx_10_12', 'tx_10_13'],
        },
        {
          title: 'STREAMFLIX ücreti yüzde 20 arttı',
          detail: 'Ağustos ve Eylül’de 149,99 TL olan ücret Ekim’de 179,99 TL oldu. Bu fiyatla yılda 360,00 TL fazla ödenir.',
          transaction_ids: ['tx_10_03'],
        },
        {
          title: 'Ekstre toplamı okunan işlemlerle tutmuyor',
          detail: 'Ekstrede yazan tutar, okunan işlemlerin toplamından 149,99 TL fazla. Ödemeden önce bankanın işlem listesiyle karşılaştırın.',
          transaction_ids: [],
        },
        {
          title: 'Yıllık kart aidatı alındı',
          detail: 'Bu dönem 1.234,56 TL aidat yansıdı. Aidat iadesi için bankaya başvurulabilir.',
          transaction_ids: ['tx_10_18'],
        },
      ],
    },
    en: {
      locale: 'en',
      summary:
        'Besides two installment plans, the October statement has a cash advance in three installments. November and December each have TRY 6,997.26 committed to installments; from January it falls to TRY 3,500.00.',
      watch_items: [
        {
          title: 'Two cash advance installments remain',
          detail: 'Each is TRY 3,497.26, of which TRY 497.26 is interest, BSMV and KKDF. Ask the bank how much early repayment would save.',
          transaction_ids: ['tx_10_10', 'tx_10_11', 'tx_10_12', 'tx_10_13'],
        },
        {
          title: 'STREAMFLIX went up 20 percent',
          detail: 'The charge was TRY 149.99 in August and September and TRY 179.99 in October. At this price you pay TRY 360.00 more a year.',
          transaction_ids: ['tx_10_03'],
        },
        {
          title: 'Statement total does not match the lines read',
          detail: 'The printed total is TRY 149.99 higher than the sum of the lines read. Compare with the bank’s own list before paying.',
          transaction_ids: [],
        },
        {
          title: 'Annual card fee charged',
          detail: 'A TRY 1,234.56 annual fee appeared this period. Banks often refund it on request.',
          transaction_ids: ['tx_10_18'],
        },
      ],
    },
  },
};

export const defaultProvider: ProviderId | null = null;
