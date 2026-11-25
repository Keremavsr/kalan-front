// v0.3.0 fixtures. Same rules as fixtures.ts: invented banks (ornekbank, denemebank), cards 0000 and 1111,
// ORNEK merchants, round or 1.234,56-style amounts. No real person, card or statement is behind any of this.
import type {
  CancelledSubscription,
  CategoryRule,
  DiagnosisReport,
  FixedCost,
  GateIssue,
  InsightRules,
  PdfPasswordHint,
} from './types';
import { buildStatement, buildTransactions } from './fixtures';

const tl = (value: number) => Math.round(value * 100);

const CARD2_BASE = {
  bank: 'denemebank',
  product: 'Deneme Kart',
  card_last4: '1111',
  currency: 'TRY',
  interest_rates: { purchase_monthly: '3.25', cash_advance_monthly: '4.25' },
  parser_id: 'tr_denemebank_kart',
  credit_limit: tl(40000),
  page_count: 1,
} as const;

/** Second card, uploaded with a file name containing "kart2" or "deneme". Its annual fee was refunded. */
export const statementCard2 = buildStatement(
  { ...CARD2_BASE, id: 'st_k2_10', period_start: '2026-10-01', period_end: '2026-10-31', due_date: '2026-11-10', analysis_status: 'none' },
  buildTransactions('k2_10', [
    { date: '2026-10-04', description: 'ORNEK GIYIM 1/3', amount: 1000, kind: 'installment', category: 'clothing', merchant: 'ORNEK GIYIM', installment: { remaining_count: 2, each: 1000, plan_id: 'pl_k2_01' } },
    { date: '2026-10-11', description: 'ORNEK SINEMA', amount: 250, kind: 'purchase', category: 'entertainment', merchant: 'ORNEK SINEMA' },
    { date: '2026-10-15', description: 'Kart aidatı', amount: 600, kind: 'fee', category: 'fees' },
    { date: '2026-10-20', description: 'Kart aidatı iadesi', amount: 600, kind: 'fee', category: 'fees', direction: 'credit' },
    { date: '2026-10-24', description: 'ORNEK MARKET', amount: 1234.56, kind: 'purchase', category: 'groceries', merchant: 'ORNEK MARKET' },
  ]),
);

/**
 * What the AI fallback "reads" from an unknown layout (file name with "bilinmeyen" or "unknown", a provider
 * selected). It does not reconcile, so it is saved for review.
 */
export const statementAiFallback = buildStatement(
  {
    ...CARD2_BASE,
    id: 'st_ai_09',
    parser_id: 'ai-fallback',
    credit_limit: null,
    period_start: '2026-09-01',
    period_end: '2026-09-30',
    due_date: '2026-10-10',
    analysis_status: 'none',
    review: [
      {
        code: 'reconciliation_mismatch',
        severity: 'soft',
        message: 'Rows do not add up to the printed totals.',
        details: { difference: tl(100), checks: ['statement_total'] },
      },
      { code: 'no_printed_summary', severity: 'soft', message: 'No totals block found; only statement_total was checked.', details: {} },
    ],
  },
  buildTransactions('ai_09', [
    { date: '2026-09-05', description: 'ORNEK KIRTASIYE', amount: 300, kind: 'purchase', category: null, merchant: 'ORNEK KIRTASIYE' },
    { date: '2026-09-12', description: 'ORNEK TEKNOLOJI 2/4', amount: 2500, kind: 'installment', category: 'electronics', merchant: 'ORNEK TEKNOLOJI', installment: { remaining_count: 2, each: 2500, plan_id: 'pl_ai_01' } },
    { date: '2026-09-20', description: 'ORNEK ECZANE', amount: 450, kind: 'purchase', category: 'health', merchant: 'ORNEK ECZANE' },
  ]),
  tl(100),
);

/** Hard and soft findings the mock returns for a file name with "engel" or "blocked". */
export const blockedIssues: GateIssue[] = [
  {
    code: 'amount_scale',
    severity: 'hard',
    message: 'A total and its rows differ by a factor of 100 (decimal separator read wrong).',
    details: { checks: ['statement_total'], factor: 100 },
  },
  { code: 'period_unusual', severity: 'soft', message: 'Period shorter than 20 or longer than 45 days.', details: { days: 52 } },
];

/** The password that opens the mock's encrypted PDFs (file name with "sifreli" or "encrypted"). Invented. */
export const MOCK_PDF_PASSWORD = '000000';

export const pdfPasswordHints: PdfPasswordHint[] = [
  { bank: 'denemebank', hint: 'doğum tarihinizin gün ve ayı (GGAA)' },
  { bank: 'ornekbank', hint: 'T.C. kimlik numaranızın son 6 hanesi' },
];

export const MOCK_BANKS = ['denemebank', 'ornekbank'];

export const CATEGORY_LIST = [
  'groceries',
  'dining',
  'transport',
  'travel',
  'subscriptions',
  'electronics',
  'home',
  'health',
  'education',
  'clothing',
  'entertainment',
  'fees',
  'taxes',
  'cash',
  'cash_advance',
  'interest_tax',
  'transfers',
  'other',
];

export const sampleCategoryRule: CategoryRule = {
  id: 'cr_01',
  pattern: 'KAFE-ORNEK',
  category: 'dining',
  created_at: '2026-10-02T10:00:00Z',
};

export const fixedCostsFixture: FixedCost[] = [
  { id: 'fc_01', name: 'ORNEK KIRA', amount: tl(15000), currency: 'TRY', day: 1, start: '2026-01', end: null, category: 'home' },
  { id: 'fc_02', name: 'BULUTDEPO', amount: tl(39.99), currency: 'TRY', day: 3, start: '2026-08', end: null, category: 'subscriptions' },
  // Overlaps fc_01: amount within 7.5 %, day within 2. The duplicate check flags the pair.
  { id: 'fc_03', name: 'KIRA ORNEK', amount: tl(15500), currency: 'TRY', day: 2, start: '2026-06', end: '2026-12', category: 'home' },
];

export const cancelledFixture: CancelledSubscription[] = [{ merchant: 'MUZIKBOX', cancelled_on: '2026-09-15' }];

export const insightRulesFixture: InsightRules = {
  rules: {
    country: 'TR',
    checked_on: '2026-10-01',
    note: 'Mock data: invented values, not the real rules file.',
    interest: { contractual_max_monthly: '3.25', late_max_monthly: '3.55' },
    taxes_on_interest: { bsmv: '0.15', kkdf: '0.15' },
    minimum_payment: { ratio: '0.20' },
    due_date: { shift_to_business_day: true },
  },
  overrides: { contractual_monthly: null, late_monthly: null, bsmv: null, kkdf: null, minimum_ratio: null },
};

/** Fixed-date public holidays the mock's which-card shift skips. */
export const FIXED_HOLIDAYS = ['01-01', '04-23', '05-01', '05-19', '07-15', '08-30', '10-29'];

export const HAKEM_HEYETI_LIMIT = tl(186000);

export const diagnosisFixture: DiagnosisReport = {
  kalan_version: '0.1.0-mock',
  page_count: 2,
  has_text: true,
  line_count: 64,
  lines_per_page: [48, 16],
  number_styles: { '1.234,56': 31, '1,234.56': 0, '1 234,56': 0 },
  date_styles: { 'DD.MM.YYYY': 22, 'DD/MM/YYYY': 0, 'YYYY-MM-DD': 0, 'DD.MM.YY': 0, 'D Month YYYY': 2 },
  templates: [
    {
      id: 'tr_ornekbank_kart',
      detected: false,
      anchors: {
        detect_all: { found: 3, total: 5, missing: ['Hesap Özeti', 'Son Ödeme Tarihi'] },
        detect_none_present: [],
        header_fields: { statement_total: true, due_date: false },
        table_header: { found: 4, total: 5, missing: ['Bonus'] },
        table_end: true,
        summary_title: false,
      },
    },
  ],
  shapes: [
    { page: 1, shape: 'AAAAAAAAA AAAA AAAAA', repeat: 1 },
    { page: 1, shape: '99.99.9999<4 sp>AAAAAA-AAAAA<6 sp>9.999,99', repeat: 18 },
    { page: 2, shape: 'Aaaaa Aaaaaa<3 sp>99.999,99', repeat: 2 },
  ],
  shapes_truncated: false,
};

export const templateDraftYaml = [
  'id: tr_denemebank_kart',
  'bank: denemebank',
  'product: Deneme Kart',
  'detect:',
  '  all: ["DENEMEBANK", "Hesap Özeti"]',
  'header:',
  '  statement_total: "Dönem Borcu"',
  '  due_date: "Son Ödeme Tarihi"',
  'table:',
  '  header: ["Tarih", "Açıklama", "Tutar"]',
  '',
].join('\n');
