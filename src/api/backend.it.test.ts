// @vitest-environment node
/// <reference types="node" />
//
// Integration test against a real kalan-back. Skipped unless KALAN_IT=1:
//
//   KALAN_IT=1 npx vitest run src/api/backend.it.test.ts
//
// It starts `kalan serve --port 0 --print-port` from KALAN_BACK_DIR (default ../back, its .venv) with a
// fresh temporary KALAN_DATA_DIR and the null keyring backend (nothing reaches the OS keyring), uploads
// the back end's synthetic Garanti fixtures (tests/fixtures/garanti, invented by tools/synth_garanti.py),
// calls every client method once and checks each answer against the client's types at runtime.
// No AI provider is selected, so no model is ever called. The server and the data folder go at the end.
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHttpApi } from './http';
import { ApiError, type KalanApi, type ProviderId } from './types';

const ENABLED = process.env.KALAN_IT === '1';
const BACK = resolve(process.env.KALAN_BACK_DIR ?? '../back');
const BIN = process.platform === 'win32' ? join(BACK, '.venv', 'Scripts') : join(BACK, '.venv', 'bin');
const KALAN = join(BIN, process.platform === 'win32' ? 'kalan.exe' : 'kalan');
const PYTHON = join(BIN, process.platform === 'win32' ? 'python.exe' : 'python');
const FIXTURES = join(BACK, 'tests', 'fixtures', 'garanti');
const PASSWORD = '000000'; // invented, only for the encrypted copy made below

// -- a tiny runtime shape checker -------------------------------------------------------------------

type Spec =
  | 'string'
  | 'number'
  | 'boolean'
  | 'null'
  | 'any'
  | { union: Spec[] }
  | { array: Spec }
  | { record: Spec }
  | { obj: Record<string, Spec>; optional?: Record<string, Spec> };

const S = 'string' as const;
const N = 'number' as const;
const B = 'boolean' as const;
const nul = (spec: Spec): Spec => ({ union: [spec, 'null'] });
const arr = (spec: Spec): Spec => ({ array: spec });
const rec = (spec: Spec): Spec => ({ record: spec });
const obj = (fields: Record<string, Spec>, optional: Record<string, Spec> = {}): Spec => ({ obj: fields, optional });

/** Keys the back end sends that the client types do not name. Not a failure; listed at the end. */
const extras = new Set<string>();

function check(value: unknown, spec: Spec, path: string, errors: string[]): void {
  if (spec === 'any') return;
  if (typeof spec === 'string') {
    const ok = spec === 'null' ? value === null : typeof value === spec;
    if (!ok) errors.push(`${path}: expected ${spec}, got ${value === null ? 'null' : typeof value}`);
    return;
  }
  if ('union' in spec) {
    const attempts = spec.union.map((s) => {
      const e: string[] = [];
      check(value, s, path, e);
      return e;
    });
    if (!attempts.some((e) => e.length === 0)) errors.push(...attempts.sort((a, b) => a.length - b.length)[0]!);
    return;
  }
  if ('array' in spec) {
    if (!Array.isArray(value)) return void errors.push(`${path}: expected array`);
    value.forEach((item, i) => check(item, spec.array, `${path}[${i}]`, errors));
    return;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return void errors.push(`${path}: expected object`);
  const record = value as Record<string, unknown>;
  if ('record' in spec) {
    for (const [k, v] of Object.entries(record)) check(v, spec.record, `${path}.${k}`, errors);
    return;
  }
  for (const [key, s] of Object.entries(spec.obj)) {
    if (!(key in record)) errors.push(`${path}.${key}: missing`);
    else check(record[key], s, `${path}.${key}`, errors);
  }
  for (const [key, s] of Object.entries(spec.optional ?? {})) {
    if (key in record && record[key] !== undefined) check(record[key], s, `${path}.${key}`, errors);
  }
  for (const key of Object.keys(record)) {
    if (!(key in spec.obj) && !(key in (spec.optional ?? {}))) extras.add(`${path.replace(/\[\d+\]/g, '[]')}.${key}`);
  }
}

function expectShape(value: unknown, spec: Spec, name: string) {
  const errors: string[] = [];
  check(value, spec, name, errors);
  expect(errors, `${name} does not match the client types`).toEqual([]);
}

// -- specs that mirror types.ts ---------------------------------------------------------------------

const Reconciliation = obj(
  { status: S, expected: N, computed: N, difference: N },
  { checks: arr(obj({ name: S, status: S, expected: N, computed: N, difference: N })) },
);
const GateIssue = obj({ code: S, severity: S, message: S, details: rec({ union: [S, N, 'null', arr(S)] }) });
const summaryFields = {
  id: S, bank: S, product: S, card_last4: S, period_start: S, period_end: S, due_date: S, currency: S,
  statement_total: N, minimum_payment: N, reconciliation: Reconciliation, analysis_status: S,
  needs_review: B, review: arr(GateIssue),
};
const StatementSummary = obj(summaryFields);
const Installment = obj({
  remaining_count: N, remaining_amount_each: N, is_last: B, plan_id: S,
  index: nul(N), total_count: nul(N), component: nul(S),
});
const Transaction = obj({
  id: S, date: S, description: S, amount: N, currency: S, direction: S, kind: S,
  installment: nul(Installment), category: nul(S), merchant: nul(S), source: S,
  original_amount: nul(N), original_currency: nul(S), points: nul(S), detail: nul(S),
});
const PrintedSummary = obj({
  previous_balance: N, period_transactions: N, interest_and_fees: nul(N), payments: N, statement_total: N,
  remaining_installments: nul(N),
});
const Statement = obj(
  { ...summaryFields, transactions: arr(Transaction), interest_rates: rec(S) },
  {
    parser_id: nul(S), credit_limit: nul(N), next_period_end: nul(S), next_due_date: nul(S),
    printed_summary: nul(PrintedSummary), page_count: nul(N),
  },
);
const Breakdown = obj({ principal: N, interest: N, bsmv: N, kkdf: N });
const ScheduleItem = obj({ plan_id: S, description: S, amount: N, index: N, count: N }, { breakdown: nul(Breakdown) });
const SchedulePlan = obj(
  { plan_id: S, description: S, kind: S, remaining_count: N, amount_each: N, ends: S, total_remaining: N },
  { breakdown: nul(Breakdown), source: S, last_statement_id: nul(S) },
);
const Schedule = obj(
  { currency: S, months: arr(obj({ month: S, total: N, items: arr(ScheduleItem) })), plans: arr(SchedulePlan) },
  {
    start_month: S,
    fixed: obj({
      kind: S,
      months: arr(obj({ month: S, total: N, items: arr(obj({ fixed_cost_id: S, name: S, amount: N, currency: S, date: S })) })),
    }),
  },
);
const FixedCost = obj({ id: S, name: S, amount: N, currency: S, day: N, start: S, end: nul(S), category: nul(S) });
const ImportSummary = obj({
  id: S, format: S, created_at: S, currency: S, detected: rec('any'), months: arr(S), rows: N, imported: N, skipped_duplicates: N,
});
const ImportResult = obj(
  { id: S, format: S, currency: S, detected: rec('any'), months: arr(S), rows: N, imported: N, skipped_duplicates: N, transactions: arr(Transaction) },
  { created_at: S },
);
const Sourced = obj({ value: S, source: S, detail: nul(S) });
const Assumption = obj({ key: S, text: S });
const CardFee = obj({
  transaction_id: S, statement_id: S, date: S, description: S, amount: N, currency: S, bank: S, product: S,
  card_last4: S, statement_period_end: S, supplementary_card: B, refunded: B,
});
const CardOption = obj({
  bank: S, product: S, card_last4: S, statement_id: S, cut_off: S, cut_off_day: N, due_offset_days: N, due_date: S,
  due_date_effective: S, shifted_days: N, interest_free_days: N, days_until_cut_off: N, first_installment_month: S,
  basis: S, stale: B,
});
const Parts = obj({ installments: N, subscriptions: N, variable: N, fixed: N });
const BacktestSummary = obj({ currency: S, count: N, mae: nul(N), mape: nul(S), bias: nul(N), min_history: N });
const Payoff = obj({
  plan_id: S, description: S, kind: S, source: S, currency: S, payoff_month: S, remaining_count: N, amount_each: N,
  remaining_total: N, discount_rule: S, note: S, breakdown: nul(Breakdown), remaining_principal: nul(N),
  would_save_if_future_interest_dropped: nul(N), schedule_effect: arr(obj({ month: S, without: N, with: N })),
});
const Cancelled = obj({ merchant: S, cancelled_on: S });
const ErrorDetails: Record<string, Spec> = {
  duplicate: obj({ statement_id: S }),
  save_blocked: obj({ issues: arr(GateIssue) }),
  pdf_password_required: obj({ hints: arr(obj({ bank: S, hint: S })) }),
  pdf_password_wrong: obj({ hints: arr(obj({ bank: S, hint: S })) }),
  unknown_format: obj({ ai_fallback: S }),
  provider_unavailable: obj({}, { id: S, detail: S }),
  unknown_bank: obj({ known: arr(S) }),
  statement_not_found: obj({ id: S }),
  transaction_not_found: obj({ id: S }),
  import_not_found: obj({ id: S }),
  job_not_found: obj({ id: S }),
  card_fee_not_found: obj({ id: S }),
  plan_not_found: obj({ id: S }),
};

/** Awaits a call that must fail with `code`; checks its details against the typed shape. */
async function expectError(promise: Promise<unknown>, code: string, status?: number) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, `expected ApiError ${code}`).toBeInstanceOf(ApiError);
  const apiError = error as ApiError;
  expect(apiError.code).toBe(code);
  if (status !== undefined) expect(apiError.status).toBe(status);
  if (ErrorDetails[code]) expectShape(apiError.details, ErrorDetails[code], `error ${code}.details`);
  return apiError;
}

// -- the server ---------------------------------------------------------------------------------

let server: ChildProcessWithoutNullStreams | undefined;
let dataDir = '';
let api: KalanApi;
const stderr: string[] = [];

function pdfFile(name: string, bytes?: Uint8Array): File {
  const data = bytes ?? readFileSync(join(FIXTURES, name));
  return new File([new Uint8Array(data)], name, { type: 'application/pdf' });
}

describe.skipIf(!ENABLED)('kalan-back integration', () => {
  beforeAll(async () => {
    if (!existsSync(KALAN)) throw new Error(`kalan not found at ${KALAN} (set KALAN_BACK_DIR)`);
    dataDir = mkdtempSync(join(tmpdir(), 'kalan-it-'));
    const env = {
      ...process.env,
      KALAN_DATA_DIR: dataDir,
      PYTHON_KEYRING_BACKEND: 'keyring.backends.null.Keyring',
      KALAN_LANG: 'en',
    };
    const child = spawn(KALAN, ['serve', '--port', '0', '--print-port'], { env, windowsHide: true });
    server = child;
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk.toString()));
    const port = await new Promise<number>((done, fail) => {
      let out = '';
      const timer = setTimeout(() => fail(new Error(`no ready line in 60 s:\n${stderr.join('')}`)), 60_000);
      child.stdout.on('data', (chunk: Buffer) => {
        out += chunk.toString();
        const line = out.split('\n').find((l) => l.includes('"ready"'));
        if (line) {
          clearTimeout(timer);
          done((JSON.parse(line) as { port: number }).port);
        }
      });
      child.on('exit', (code) => fail(new Error(`kalan exited with ${code}:\n${stderr.join('')}`)));
    });
    api = createHttpApi(`http://127.0.0.1:${port}`);
  }, 90_000);

  afterAll(async () => {
    if (server && server.exitCode === null) {
      const exited = new Promise((done) => server!.once('exit', done));
      server.stdin.end(); // kalan serve exits when its stdin pipe closes
      const timer = setTimeout(() => server!.kill(), 10_000);
      await exited;
      clearTimeout(timer);
    }
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    if (extras.size) console.info(`Back end keys the client types do not name:\n  ${[...extras].sort().join('\n  ')}`);
  }, 30_000);

  it('answers every client method with the typed shapes', async () => {
    // health and setup
    expectShape(await api.health(), obj({ status: S, version: S }), 'health');
    const providers = await api.getProviders();
    expectShape(providers, obj({ providers: arr(obj({ id: S, name: S, available: B, detail: S })), selected: nul(S) }), 'providers');
    expect(providers.selected).toBeNull();
    const unavailable = providers.providers.find((p) => !p.available);
    // Selecting an unavailable provider fails, so no model can be reached by anything below.
    if (unavailable) await expectError(api.selectProvider(unavailable.id), 'provider_unavailable', 409);
    else await expectError(api.selectProvider('no-such-provider' as ProviderId), 'unknown_provider', 422);
    const settings = await api.getSettings();
    expectShape(settings, obj({ locale: S, base_currency: S, months_ahead: N }), 'settings');
    expectShape(await api.putSettings(settings), obj({ locale: S, base_currency: S, months_ahead: N }), 'putSettings');

    // remembered PDF passwords (null keyring: accepted, never kept)
    const passwords = await api.getPdfPasswords();
    expectShape(passwords, obj({ keyring: B, items: arr(obj({ bank: S, hint: nul(S), remembered: B })) }), 'pdfPasswords');
    expect(passwords.items.some((i) => i.bank === 'garanti')).toBe(true);
    await expectError(api.putPdfPassword('no-such-bank', PASSWORD), 'unknown_bank', 404);
    await api.putPdfPassword('garanti', PASSWORD);
    await expectError(api.deletePdfPassword('garanti'), 'not_remembered', 404);

    // encrypted upload: an AES copy of a synthetic statement, made with the back end's own PyMuPDF
    const locked = spawnSync(
      PYTHON,
      ['-I', '-c', 'import sys,pymupdf;d=pymupdf.open(sys.argv[1]);sys.stdout.buffer.write(d.tobytes(encryption=pymupdf.PDF_ENCRYPT_AES_256,user_pw=sys.argv[2],owner_pw=sys.argv[2]+"-o"))', join(FIXTURES, 'gb-06-2026-06-26.pdf'), PASSWORD],
      { maxBuffer: 20 * 1024 * 1024, windowsHide: true },
    );
    expect(locked.status, locked.stderr?.toString()).toBe(0);
    const lockedFile = () => pdfFile('gb-06-locked.pdf', locked.stdout);
    await expectError(api.uploadStatementDetailed(lockedFile()), 'pdf_password_required', 422);
    await expectError(api.uploadStatementDetailed(lockedFile(), { password: 'wrong' }), 'pdf_password_wrong', 422);
    const opened = await api.uploadStatementDetailed(lockedFile(), { password: PASSWORD, rememberPassword: true });
    expectShape(opened.statement, Statement, 'uploadStatementDetailed');
    expect(typeof opened.passwordRemembered).toBe('boolean');

    // plain uploads, duplicate, unknown format
    for (const name of ['gb-07-2026-07-27.pdf', 'gb-08-2026-08-26.pdf']) {
      expectShape(await api.uploadStatement(pdfFile(name)), Statement, `upload ${name}`);
    }
    const sep = await api.uploadStatement(pdfFile('gb-09-2026-09-25.pdf'), { aiFallback: false });
    expectShape(sep, Statement, 'upload gb-09');
    const dup = await expectError(api.uploadStatement(pdfFile('gb-09-2026-09-25.pdf')), 'duplicate', 409);
    expect(dup.details.statement_id).toBe(sep.id);
    await expectError(api.uploadStatement(new File(['not a pdf'], 'x.pdf')), 'not_pdf', 415);

    const list = await api.listStatements();
    expectShape(list, obj({ items: arr(StatementSummary) }), 'listStatements');
    expect(list.items).toHaveLength(4);
    expectShape(await api.getStatement(sep.id), Statement, 'getStatement');
    await expectError(api.createTemplateDraft(sep.id), 'no_statement_text', 409);

    // categories and diagnosis
    const rules = await api.getCategoryRules();
    expectShape(rules, obj({ items: arr(obj({ id: S, pattern: S, category: S, created_at: S })), categories: arr(S) }), 'categoryRules');
    const merchant = sep.transactions.find((t) => t.merchant)?.merchant ?? 'ORNEK';
    const rule = await api.createCategoryRule({ pattern: merchant, category: rules.categories[0]! });
    expectShape(rule, obj({ rule: obj({ id: S, pattern: S, category: S, created_at: S }), applied: N }), 'createCategoryRule');
    await expectError(api.createCategoryRule({ pattern: merchant, category: rules.categories[0]! }), 'duplicate_rule', 409);
    await api.deleteCategoryRule(rule.rule.id);
    const diagnosis = await api.diagnose(pdfFile('gb-06-2026-06-26.pdf'));
    expectShape(
      diagnosis,
      obj({
        report: obj({
          kalan_version: S, page_count: N, has_text: B, line_count: N, lines_per_page: arr(N), number_styles: rec(N),
          date_styles: rec(N), templates: arr(obj({ id: S, detected: B }, { anchors: nul(rec('any')) })),
          shapes: arr(obj({ page: N, shape: S, repeat: N })), shapes_truncated: B,
        }),
        text: S,
      }),
      'diagnose',
    );
    await expectError(api.diagnose(lockedFile()), 'pdf_password_required', 422);

    // imports (invented rows)
    const csv = 'date;description;amount\n2026-10-03;ORNEK FIRIN;-120,00\n2026-10-09;ORNEK MOBILYA 1/3;-1.000,00\n';
    const imported = await api.importFile(new File([csv], 'ornek.csv', { type: 'text/csv' }));
    expectShape(imported, ImportResult, 'importFile');
    expect(imported.imported).toBe(2);
    expectShape(await api.listImports(), obj({ items: arr(ImportSummary) }), 'listImports');
    await expectError(api.importFile(new File(['x'], 'x.csv'), { mapping: { sign: 'sideways' as never } }), 'invalid_mapping', 422);

    // manual entry and fixed costs
    const manual = await api.createTransaction({
      date: '2026-10-05', description: 'ORNEK TELEFON', amount: 600000, currency: 'TRY', direction: 'debit',
      installment: { total_count: 6, amount_each: 100000 },
    });
    expectShape(manual, Transaction, 'createTransaction');
    expectShape(await api.listTransactions({ month: '2026-09' }), obj({ items: arr(Transaction) }), 'listTransactions');
    const cost = await api.createFixedCost({ name: 'ORNEK KIRA', amount: 1500000, day: 1, start: '2026-01' });
    expectShape(cost, FixedCost, 'createFixedCost');
    expectShape(await api.listFixedCosts(), obj({ items: arr(FixedCost) }), 'listFixedCosts');
    await expectError(api.createFixedCost({ name: 'X', amount: 100, day: 1, start: '2026-05', end: '2026-01' }), 'invalid_period', 422);

    // calculations and alerts
    const schedule = await api.getSchedule(12);
    expectShape(schedule, Schedule, 'schedule');
    expect(schedule.fixed).toBeDefined();
    expectShape(
      await api.getMonthlySummary('2026-09'),
      obj({
        month: S, currency: S, total_spend: N, total_credit: N, by_category: arr(obj({ category: S, amount: N, share: S })),
        previous_month: nul(obj({ total_spend: N, change: S })), statement_ids: arr(S),
      }),
      'monthlySummary',
    );
    expectShape(
      await api.getSubscriptions(),
      obj({ items: arr(obj({ merchant: S, amount_last: N, amount_previous: N, currency: S, months_seen: arr(S), price_change: nul(S) })) }),
      'subscriptions',
    );
    expectShape(
      await api.simulateInstallment({ amount: 120000, count: 6, start_month: schedule.months[0]!.month, interest_monthly: '3.11' }),
      obj({
        currency: S,
        purchase: obj({
          amount: N, count: N, start_month: S, interest_monthly: nul(S),
          installments: arr(obj({ month: S, amount: N, principal: N, interest: N })), total_cost: N, interest_total: N, ends: S,
        }),
        months: arr(obj({ month: S, without: N, purchase: N, with: N })),
        peak: obj({ without: obj({ month: S, total: N }), with: obj({ month: S, total: N }) }),
      }),
      'simulateInstallment',
    );
    const alerts = await api.getAlerts();
    expectShape(
      alerts,
      obj({
        items: arr(
          obj({
            id: S, kind: S, severity: S, month: S, message_key: S, params: rec('any'),
            refs: obj({ statement_ids: arr(S), transaction_ids: arr(S), plan_ids: arr(S) }),
          }),
        ),
      }),
      'alerts',
    );

    // model analysis: no provider, so the start fails; unknown job and analysis are 404
    await expectError(api.analyzeStatement(sep.id), 'no_provider', 409);
    await expectError(api.getJob('job_none'), 'job_not_found', 404);
    await expectError(api.getAnalysis(sep.id), 'analysis_not_found', 404);
    await expectError(api.getStatement('st_none'), 'statement_not_found', 404);

    // insights
    const insightRules = await api.getInsightRules();
    expectShape(
      insightRules,
      obj({ rules: rec('any'), overrides: obj({ contractual_monthly: nul(S), late_monthly: nul(S), bsmv: nul(S), kkdf: nul(S), minimum_ratio: nul(S) }) }),
      'insightRules',
    );
    expectShape(await api.putInsightRules({}), obj({ rules: rec('any'), overrides: rec(nul(S)) }), 'putInsightRules');
    await expectError(api.putInsightRules({ bsmv: '15' }), 'validation_error', 422);
    expectShape(
      await api.getMinimumPayment({ cycles: 5 }),
      obj({
        statement_id: S, currency: S, start_balance: N,
        minimum_only: obj({
          cycles: N, paid_off: B, last_payment_cut_off: nul(S), total_paid: N, interest: N, bsmv: N, kkdf: N, cost: N, balance_left: N,
        }),
        pay_in_full: obj({ total_paid: N, cost: N }),
        extra_cost: N,
        rates: obj({
          contractual_monthly: arr(obj({ from_cycle: N, monthly: S, source: S, detail: nul(S) })),
          bsmv: Sourced, kkdf: Sourced, minimum_ratio: Sourced,
        }),
        assumptions: arr(Assumption),
        cycles: arr(
          obj({ cycle: N, cut_off: S, balance: N, payment: N, unpaid: N, days: N, interest: N, bsmv: N, kkdf: N, added: N, next_balance: N }),
        ),
      }),
      'minimumPayment',
    );
    await expectError(api.getMinimumPayment({ statement_id: 'st_none' }), 'statement_not_found', 404);
    const fees = await api.listCardFees();
    expectShape(fees, obj({ items: arr(CardFee) }), 'cardFees');
    expect(fees.items.length).toBeGreaterThan(0); // gb-09 has an annual fee
    const fee = fees.items[0]!;
    expectShape(
      await api.getCardFeePrompt(fee.transaction_id),
      obj({
        fee: CardFee, route: S,
        hakem_heyeti: obj({ year: N, limit_below: N, currency: S, source: S, apply: S }),
        legal_basis: arr(obj({ id: S, title: S, summary: S, source: S, verified: { union: [B, S] } })),
        placeholders: arr(S), prompt: S, note: S,
      }),
      'cardFeePrompt',
    );
    await expectError(api.getCardFeePrompt('tx_none'), 'card_fee_not_found', 404);
    await expectError(api.draftCardFeeLetter(fee.transaction_id), 'no_provider', 409);
    const which = await api.getWhichCard('2026-10-01');
    expectShape(which, obj({ date: S, best: nul(CardOption), cards: arr(CardOption), assumptions: arr(Assumption) }), 'whichCard');
    const share = await api.getShareCard({ locale: 'en', amounts: true });
    expectShape(
      share,
      obj({ locale: S, show_amounts: B, sentence: S, months: arr(obj({ month: S, share: S }, { total: N })), svg: S }, { currency: S }),
      'shareCard',
    );
    const svg = await api.getShareCardSvg({ locale: 'en', amounts: true });
    expect(svg.startsWith('<svg')).toBe(true);
    expectShape(
      await api.getForecast(true),
      obj({
        open_period: obj({ from: nul(S), to: S, transactions: arr(Transaction), debit_total: N, credit_total: N }),
        forecast: nul(
          obj({
            month: S, currency: S, total: N, parts: Parts, include_fixed: B,
            variable_basis: obj({ months: arr(S), median: N, known_in_month: N }),
            installment_items: arr(ScheduleItem), subscriptions: arr(obj({ merchant: S, amount: N })),
          }),
        ),
        backtest: BacktestSummary,
      }),
      'forecast',
    );
    const backtest = await api.getForecastBacktest({ min_history: 2 });
    expectShape(backtest, obj({
      currency: S, count: N, mae: nul(N), mape: nul(S), bias: nul(N), min_history: N,
      months: arr(obj({ month: S, forecast: N, actual: N, error: N, parts: Parts })),
    }), 'backtest');
    const overview = await api.getEarlyPayoffOverview();
    expectShape(
      overview,
      obj({
        currency: S, start_month: S, plans: arr(Payoff),
        closed_early: arr(obj({ plan_id: S, statement_id: S, month: S, transaction_id: S, index: nul(N), total_count: nul(N) })),
      }),
      'earlyPayoffOverview',
    );
    const plan = schedule.plans[0];
    if (plan) {
      expectShape(await api.getEarlyPayoff(plan.plan_id), Payoff, 'earlyPayoff');
      await expectError(api.getEarlyPayoff(plan.plan_id, '2099-01'), 'month_outside_schedule', 422);
    }
    await expectError(api.getEarlyPayoff('pl_none'), 'plan_not_found', 404);
    expectShape(await api.listCancelledSubscriptions(), obj({ items: arr(Cancelled) }), 'cancelled');
    const cancelled = await api.addCancelledSubscription({ merchant: 'ORNEK MUZIK', cancelled_on: '2026-08-01' });
    expectShape(cancelled, obj({ items: arr(Cancelled) }), 'addCancelled');
    await api.deleteCancelledSubscription('ornek muzik');
    await expectError(api.deleteCancelledSubscription('ORNEK MUZIK'), 'cancellation_not_found', 404);
    expectShape(
      await api.getFixedCostMatches(),
      obj({
        tolerance: obj({ amount: S, days: N }),
        costs: arr(
          obj({
            fixed_cost_id: S, name: S, amount: N, currency: S, day: N, missing_months: arr(S),
            matches: arr(obj({ fixed_cost_id: S, month: S, transaction_id: S, date: S, amount: N, amount_diff: N, day_diff: N })),
          }),
        ),
        duplicates: arr(obj({ fixed_cost_ids: arr(S), same_name: B, amount_diff: N, day_gap: N })),
      }),
      'fixedCostMatches',
    );
    for (const format of ['csv', 'ofx', 'hledger', 'beancount'] as const) {
      const file = await api.exportData({ format });
      expectShape(file, obj({ text: S, filename: S, contentType: S, skippedRows: nul(N) }), `export ${format}`);
      expect(file.text.length, format).toBeGreaterThan(0);
      expect(file.filename).toMatch(/^kalan-transactions\./);
    }
    const plansCsv = await api.exportData({ format: 'csv', what: 'plans' });
    expect(plansCsv.text.split('\n')[0]).toBe('plan_id,description,kind,source,amount_each,remaining_count,ends,total_remaining,currency');
    await expectError(api.exportData({ format: 'ofx', what: 'plans' }), 'plans_csv_only', 422);

    // clean-up routes
    await api.deleteFixedCost(cost.id);
    await expectError(api.deleteFixedCost(cost.id), 'fixed_cost_not_found', 404);
    await api.deleteImport(imported.id);
    await api.deleteTransaction(manual.id);
    await expectError(api.deleteTransaction(sep.transactions[0]!.id), 'not_manual', 409);
    await expectError(api.deleteImport(imported.id), 'import_not_found', 404);
    await api.deleteStatement(opened.statement.id);
    expect((await api.listStatements()).items).toHaveLength(3);
  }, 180_000);
});
