import { describe, expect, it } from 'vitest';
import { createMockApi } from './mock';
import { isApiError } from './types';
import { MOCK_PDF_PASSWORD } from './fixtures-v03';

const pdf = (name: string) => new File(['%PDF-1.4 invented'], name, { type: 'application/pdf' });
const fast = (preset: 'basic' | 'full' = 'basic') => createMockApi({ latency: 0, uploadMs: 0, analysisMs: 0, preset });
const caught = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e);

describe('mock: statements v0.3.0', () => {
  it('asks for a PDF password, rejects a wrong one, and remembers a right one', async () => {
    const api = fast();
    const required = await caught(api.uploadStatement(pdf('sifreli.pdf')));
    expect(isApiError(required, 'pdf_password_required')).toBe(true);
    if (isApiError(required, 'pdf_password_required')) expect(required.details.hints.map((h) => h.bank)).toContain('ornekbank');
    expect(isApiError(await caught(api.uploadStatement(pdf('sifreli.pdf'), { password: 'yanlis' })), 'pdf_password_wrong')).toBe(true);

    const ok = await api.uploadStatementDetailed(pdf('sifreli.pdf'), { password: MOCK_PDF_PASSWORD, rememberPassword: true });
    expect(ok.passwordRemembered).toBe(true);
    expect((await api.getPdfPasswords()).items.find((i) => i.bank === 'ornekbank')?.remembered).toBe(true);

    // A remembered password opens the next encrypted file without asking.
    const second = await api.uploadStatementDetailed(pdf('sifreli-kart2.pdf'), {});
    expect(second.statement.id).toBe('st_k2_10');
    expect(second.passwordRemembered).toBeNull();
  });

  it('manages remembered passwords', async () => {
    const api = fast();
    expect(isApiError(await caught(api.putPdfPassword('yokbank', 'x')), 'unknown_bank')).toBe(true);
    await api.putPdfPassword('denemebank', 'x');
    expect((await api.getPdfPasswords()).items.find((i) => i.bank === 'denemebank')?.remembered).toBe(true);
    await api.deletePdfPassword('denemebank');
    expect(isApiError(await caught(api.deletePdfPassword('denemebank')), 'not_remembered')).toBe(true);
  });

  it('blocks a save with hard findings and saves soft ones for review', async () => {
    const api = fast();
    const blocked = await caught(api.uploadStatement(pdf('engel.pdf')));
    expect(isApiError(blocked, 'save_blocked')).toBe(true);
    if (isApiError(blocked, 'save_blocked')) {
      expect(blocked.details.issues.map((i) => i.severity)).toEqual(['hard', 'soft']);
    }
    const st = await api.uploadStatement(pdf('ekim.pdf'));
    expect(st.needs_review).toBe(true);
    expect(st.review.map((r) => r.code)).toEqual(['reconciliation_mismatch']);
    const dup = await caught(api.uploadStatement(pdf('ekim.pdf')));
    expect(isApiError(dup, 'duplicate')).toBe(true);
    if (isApiError(dup, 'duplicate')) expect(dup.details.statement_id).toBe('st_10');
  });

  it('reads an unknown layout with the AI fallback only when allowed and a provider is chosen', async () => {
    const api = fast();
    const noProvider = await caught(api.uploadStatement(pdf('bilinmeyen.pdf')));
    expect(isApiError(noProvider, 'unknown_format') && noProvider.details.ai_fallback).toBe('no_provider');
    await api.selectProvider('claude-cli');
    const off = await caught(api.uploadStatement(pdf('bilinmeyen.pdf'), { aiFallback: false }));
    expect(isApiError(off, 'unknown_format') && off.details.ai_fallback).toBe('off');

    const st = await api.uploadStatement(pdf('bilinmeyen.pdf'));
    expect(st).toMatchObject({ parser_id: 'ai-fallback', needs_review: true });
    const draft = await api.createTemplateDraft(st.id);
    expect(draft).toMatchObject({ provider: 'claude-cli', valid: true, errors: [] });
    expect(draft.yaml).toContain('denemebank');
    expect(isApiError(await caught(api.createTemplateDraft('st_09')), 'no_statement_text')).toBe(true);
  });

  it('diagnoses a PDF without storing it', async () => {
    const api = fast();
    const { report, text } = await api.diagnose(pdf('bilinmeyen.pdf'));
    expect(report.has_text).toBe(true);
    expect(text).toContain('pages');
    expect((await api.listStatements()).items).toHaveLength(2);
    expect(isApiError(await caught(api.diagnose(new File(['x'], 'notlar.txt'))), 'not_pdf')).toBe(true);
    expect(isApiError(await caught(api.diagnose(pdf('sifreli.pdf'))), 'pdf_password_required')).toBe(true);
  });
});

describe('mock: categories, imports, manual rows, fixed costs', () => {
  it('adds a rule, recategorises stored rows and refuses a duplicate', async () => {
    const api = fast();
    const created = await api.createCategoryRule({ pattern: 'kafe-örnek', category: 'groceries' });
    expect(created.applied).toBe(2);
    const st = await api.getStatement('st_09');
    expect(st.transactions.find((t) => t.merchant === 'KAFE-ORNEK')?.category).toBe('groceries');
    const dup = await caught(api.createCategoryRule({ pattern: 'KAFE-ORNEK', category: 'dining' }));
    expect(isApiError(dup, 'duplicate_rule') && dup.details.rule_id).toBe(created.rule.id);
    expect(isApiError(await caught(api.createCategoryRule({ pattern: '***', category: 'dining' })), 'invalid_pattern')).toBe(true);
    expect(isApiError(await caught(api.createCategoryRule({ pattern: 'X', category: 'yok' })), 'validation_error')).toBe(true);
    await api.deleteCategoryRule(created.rule.id);
    expect((await api.getCategoryRules()).items).toHaveLength(0);
  });

  it('imports a CSV, skips rows already imported and lists them as import rows', async () => {
    const api = fast();
    const body = 'Tarih;Açıklama;Tutar\n05.11.2026;ORNEK FIRIN;-120,00\n09.11.2026;ORNEK MOBILYA 1/3;-1.000,00\n';
    const first = await api.importFile(new File([body], 'banka.csv', { type: 'text/csv' }));
    expect(first).toMatchObject({ format: 'csv', rows: 2, imported: 2, skipped_duplicates: 0, months: ['2026-11'] });
    expect(first.detected).toMatchObject({ delimiter: ';', decimal: ',', date_format: 'DD.MM.YYYY' });
    expect(first.transactions[1]!.installment).toMatchObject({ index: 1, total_count: 3, remaining_count: 2 });
    const again = await api.importFile(new File([body], 'banka.csv'));
    expect(again).toMatchObject({ imported: 0, skipped_duplicates: 2 });
    expect((await api.listTransactions({ source: 'import' })).items).toHaveLength(2);
    expect((await api.listImports()).items).toHaveLength(2);
    await api.deleteImport(first.id);
    expect((await api.listTransactions({ source: 'import' })).items).toHaveLength(0);
    expect(isApiError(await caught(api.importFile(new File(['bos'], 'x.csv'))), 'import_unreadable')).toBe(true);
  });

  it('lists transactions by month and source', async () => {
    const api = fast();
    const sep = await api.listTransactions({ month: '2026-09' });
    expect(sep.items.every((t) => t.date.startsWith('2026-09'))).toBe(true);
    expect(sep.items.map((t) => t.date)).toEqual([...sep.items.map((t) => t.date)].sort());
    expect((await api.listTransactions({ source: 'manual' })).items).toHaveLength(0);
  });

  it('keeps fixed costs out of the installment totals and in the fixed series', async () => {
    const api = fast();
    const before = await api.getSchedule(3);
    const cost = await api.createFixedCost({ name: 'ORNEK KIRA', amount: 1500000, day: 31, start: '2026-01' });
    expect(cost.currency).toBe('TRY');
    const after = await api.getSchedule(3);
    expect(after.months.map((m) => m.total)).toEqual(before.months.map((m) => m.total));
    expect(after.fixed!.months[1]).toMatchObject({ month: '2026-11', total: 1500000 });
    expect(after.fixed!.months[1]!.items[0]!.date).toBe('2026-11-30');
    expect(isApiError(await caught(api.createFixedCost({ name: 'X', amount: 1, day: 1, start: '2026-05', end: '2026-01' })), 'invalid_period')).toBe(true);
    await api.deleteFixedCost(cost.id);
    expect(isApiError(await caught(api.deleteFixedCost(cost.id)), 'fixed_cost_not_found')).toBe(true);
  });
});

describe('mock: calculations and alerts', () => {
  it('simulates an installment purchase without and with interest', async () => {
    const api = fast();
    const plain = await api.simulateInstallment({ amount: 100001, count: 4, start_month: '2026-10' });
    expect(plain.purchase.installments.map((i) => i.amount)).toEqual([25001, 25000, 25000, 25000]);
    expect(plain.purchase).toMatchObject({ total_cost: 100001, interest_total: 0, ends: '2027-01' });
    expect(plain.months[0]).toMatchObject({ month: '2026-10', purchase: 25001 });
    expect(plain.months[0]!.with).toBe(plain.months[0]!.without + 25001);

    const interest = await api.simulateInstallment({ amount: 120000, count: 6, start_month: '2026-12', interest_monthly: '3.11' });
    const rows = interest.purchase.installments;
    expect(rows.reduce((s, r) => s + r.principal, 0)).toBe(120000);
    expect(interest.purchase.interest_total).toBeGreaterThan(0);
    expect(interest.peak.with.total).toBeGreaterThanOrEqual(interest.peak.without.total);
  });

  it('produces critical, warning and info alerts, critical first', async () => {
    const api = fast('full');
    const { items } = await api.getAlerts();
    const severities = items.map((a) => a.severity);
    expect(severities).toEqual([...severities].sort((a, b) => ['critical', 'warning', 'info'].indexOf(a) - ['critical', 'warning', 'info'].indexOf(b)));
    const kinds = new Set(items.map((a) => a.kind));
    for (const kind of ['due_soon', 'charged_after_cancel', 'limit_high', 'interest_charged', 'fee_charged', 'foreign_currency', 'subscription_price_rise', 'installment_ending']) {
      expect(kinds.has(kind as never), kind).toBe(true);
    }
    expect(items.find((a) => a.kind === 'due_soon')).toMatchObject({ severity: 'critical', params: { days_left: 1 } });
    expect(items.find((a) => a.kind === 'limit_high')).toMatchObject({ severity: 'warning', params: { used_share: '0.86' } });
    expect(items.find((a) => a.kind === 'charged_after_cancel')).toMatchObject({ params: { merchant: 'MUZIKBOX', count: 1 } });
    expect(items.every((a) => a.message_key === `alert.${a.kind}`)).toBe(true);
    expect((await api.getAlerts()).items.map((a) => a.id)).toEqual(items.map((a) => a.id));
  });

  it('gives the plan breakdown over the remaining total, the item breakdown per month', async () => {
    const api = fast();
    await api.uploadStatement(pdf('ekim.pdf'));
    const s = await api.getSchedule(12);
    const plan = s.plans.find((p) => p.kind === 'cash_advance')!;
    const b = plan.breakdown!;
    expect(b.principal + b.interest + b.bsmv + b.kkdf).toBe(plan.total_remaining);
    const item = s.months[0]!.items.find((i) => i.plan_id === plan.plan_id)!;
    const e = item.breakdown!;
    expect(e.principal + e.interest + e.bsmv + e.kkdf).toBe(item.amount);
  });
});

describe('mock: insights', () => {
  it('keeps rule overrides and uses them in the minimum payment plan', async () => {
    const api = fast('full');
    const base = await api.getMinimumPayment({ statement_id: 'st_10' });
    expect(base.minimum_only.paid_off).toBe(true);
    expect(base.rates.contractual_monthly[0]).toMatchObject({ monthly: '3.25', source: 'statement' });
    expect(base.extra_cost).toBe(base.minimum_only.cost);
    expect(base.cycles[0]).toMatchObject({ cycle: 1, payment: 301100, balance: 1505563 });

    const rules = await api.putInsightRules({ contractual_monthly: '4.00' });
    expect(rules.overrides.contractual_monthly).toBe('4.00');
    const higher = await api.getMinimumPayment({ statement_id: 'st_10', cycles: 2 });
    expect(higher.cycles).toHaveLength(2);
    expect(higher.minimum_only.cost).toBeGreaterThan(base.minimum_only.cost);
    expect(isApiError(await caught(api.putInsightRules({ bsmv: '15' })), 'validation_error')).toBe(true);
    expect((await api.putInsightRules({})).overrides.contractual_monthly).toBeNull();
    expect(isApiError(await caught(fast().getMinimumPayment({ statement_id: 'yok' })), 'statement_not_found')).toBe(true);
  });

  it('finds refunded and unrefunded card fees and drafts a letter with a provider', async () => {
    const api = fast('full');
    const { items } = await api.listCardFees();
    expect(items.map((f) => [f.bank, f.amount, f.refunded])).toEqual([
      ['ornekbank', 123456, false],
      ['denemebank', 60000, true],
    ]);
    const prompt = await api.getCardFeePrompt(items[0]!.transaction_id);
    expect(prompt.route).toBe('hakem_heyeti');
    expect(prompt.prompt).toContain('[AD SOYAD]');
    const draft = await api.draftCardFeeLetter(items[0]!.transaction_id);
    expect(draft.placeholders_missing).toEqual(['[TELEFON]']);
    expect(isApiError(await caught(api.getCardFeePrompt('tx_yok')), 'card_fee_not_found')).toBe(true);
    expect(isApiError(await caught(fast().draftCardFeeLetter('tx_10_18')), 'card_fee_not_found')).toBe(true);
  });

  it('compares two cards for a purchase today', async () => {
    const api = fast('full');
    const result = await api.getWhichCard('2026-11-09');
    expect(result.cards).toHaveLength(2);
    expect(result.best).toEqual(result.cards[0]);
    const [first, second] = result.cards;
    expect(first!.interest_free_days).toBeGreaterThanOrEqual(second!.interest_free_days);
    const ornek = result.cards.find((c) => c.bank === 'ornekbank')!;
    expect(ornek).toMatchObject({ basis: 'printed', cut_off: '2026-11-25', due_date: '2026-12-04', first_installment_month: '2026-11' });
    const deneme = result.cards.find((c) => c.bank === 'denemebank')!;
    expect(deneme).toMatchObject({ basis: 'projected', cut_off: '2026-11-30', due_offset_days: 10 });
  });

  it('builds the share card without names and the same SVG on its own route', async () => {
    const api = fast('full');
    const card = await api.getShareCard({ locale: 'en', amounts: true });
    expect(card.months).toHaveLength(12);
    expect(card.months.some((m) => m.share === '1.00')).toBe(true);
    expect(card.currency).toBe('TRY');
    expect(card.svg).not.toMatch(/ORNEK|ornekbank|0000/);
    const svg = await api.getShareCardSvg({ locale: 'en', amounts: true });
    expect(svg).toBe(card.svg);
    expect((await api.getShareCard()).months[0]!.total).toBeUndefined();
  });

  it('forecasts the next statement and backtests past months', async () => {
    const api = fast('full');
    await api.createTransaction({ date: '2026-11-02', description: 'ORNEK KAFE', amount: 25000, currency: 'TRY', direction: 'debit', installment: null });
    const f = await api.getForecast(true);
    expect(f.open_period).toMatchObject({ from: '2026-11-01', debit_total: 25000 });
    expect(f.forecast!.month).toBe('2026-11');
    const p = f.forecast!.parts;
    expect(f.forecast!.total).toBe(p.installments + p.subscriptions + p.variable + p.fixed);
    const withoutFixed = await api.getForecast(false);
    expect(withoutFixed.forecast!.total).toBe(f.forecast!.total - p.fixed);
    const bt = await api.getForecastBacktest({ min_history: 2 });
    expect(bt.count).toBe(bt.months.length);
    expect(bt.months.every((m) => m.error === m.forecast - m.actual)).toBe(true);
  });

  it('pays off a plan early and refuses a month outside the schedule', async () => {
    const api = fast();
    await api.uploadStatement(pdf('ekim.pdf'));
    const overview = await api.getEarlyPayoffOverview();
    expect(overview.plans.map((p) => p.plan_id).sort()).toEqual(['pl_01', 'pl_02', 'pl_03']);
    const cash = await api.getEarlyPayoff('pl_01');
    expect(cash).toMatchObject({ remaining_count: 2, remaining_total: 699452, discount_rule: 'unknown' });
    expect(cash.remaining_principal).toBe(600000);
    expect(cash.would_save_if_future_interest_dropped).toBe(99452);
    const first = cash.schedule_effect[0]!;
    expect(first.with - first.without).toBe(349726);
    expect(isApiError(await caught(api.getEarlyPayoff('pl_01', '2030-01')), 'month_outside_schedule')).toBe(true);
    expect(isApiError(await caught(api.getEarlyPayoff('pl_yok')), 'plan_not_found')).toBe(true);
  });

  it('marks a subscription cancelled and alerts on a later charge', async () => {
    const api = fast();
    expect((await api.getAlerts()).items.some((a) => a.kind === 'charged_after_cancel')).toBe(false);
    const list = await api.addCancelledSubscription({ merchant: 'muzikbox', cancelled_on: '2026-08-15' });
    expect(list.items).toEqual([{ merchant: 'muzikbox', cancelled_on: '2026-08-15' }]);
    expect((await api.addCancelledSubscription({ merchant: 'MUZIKBOX', cancelled_on: '2026-08-20' })).items).toHaveLength(1);
    expect((await api.getAlerts()).items.find((a) => a.kind === 'charged_after_cancel')).toMatchObject({ severity: 'critical' });
    await api.deleteCancelledSubscription('MuzikBox');
    expect(isApiError(await caught(api.deleteCancelledSubscription('MUZIKBOX')), 'cancellation_not_found')).toBe(true);
  });

  it('matches fixed costs to card rows and flags the duplicate pair', async () => {
    const api = fast('full');
    const report = await api.getFixedCostMatches();
    const cloud = report.costs.find((c) => c.name === 'BULUTDEPO')!;
    expect(cloud.matches.map((m) => m.month)).toEqual(['2026-09', '2026-10']);
    expect(cloud.missing_months).toEqual(['2026-08']);
    expect(report.duplicates).toEqual([{ fixed_cost_ids: ['fc_01', 'fc_03'], same_name: false, amount_diff: 50000, day_gap: 1 }]);
  });

  it('exports every format, OFX counting the rows left out', async () => {
    const api = fast('full');
    const csv = await api.exportData({ format: 'csv' });
    expect(csv.text.split('\n')[0]).toBe('date,description,debit,credit,currency,installment,kind,category,source,account,id');
    expect(csv.text).not.toContain('Önceki dönem bakiyesi');
    expect(csv.filename).toBe('kalan-transactions.csv');
    const plans = await api.exportData({ format: 'csv', what: 'plans' });
    expect(plans.text.split('\n')[0]).toContain('plan_id');
    expect(isApiError(await caught(api.exportData({ format: 'ofx', what: 'plans' })), 'plans_csv_only')).toBe(true);
    const ofx = await api.exportData({ format: 'ofx', currency: 'USD' });
    expect(ofx.skippedRows).toBeGreaterThan(0);
    for (const format of ['hledger', 'beancount'] as const) {
      const file = await api.exportData({ format });
      expect(file.text.length, format).toBeGreaterThan(100);
    }
  });
});
