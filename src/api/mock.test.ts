import { describe, expect, it } from 'vitest';
import { createMockApi } from './mock';
import { ApiError } from './types';
import { computeStatementTotal, statement10 } from './fixtures';
import { readSchedule } from '../features/calendar/schedule';

const pdf = (name = 'ekstre.pdf') => new File(['%PDF-1.4 invented'], name, { type: 'application/pdf' });
const fast = () => createMockApi({ latency: 0, uploadMs: 0, analysisMs: 0 });

describe('mock fixtures', () => {
  it('statement 10 has one reconciliation mismatch of 149,99 TL', () => {
    expect(statement10.reconciliation.status).toBe('mismatch');
    expect(statement10.reconciliation.difference).toBe(14999);
    expect(statement10.reconciliation.computed).toBe(computeStatementTotal(statement10.transactions));
  });

  it('the cash advance installment is principal + interest + BSMV + KKDF', () => {
    const ca = statement10.transactions.filter((t) => t.date === '2026-10-14');
    expect(ca.map((t) => t.kind)).toEqual(['cash_advance', 'interest', 'tax', 'tax']);
    const sum = ca.reduce((s, t) => s + t.amount, 0);
    expect(sum).toBe(ca[0]!.installment!.remaining_amount_each);
  });
});

describe('mock api', () => {
  it('derives the schedule from stored statements and moves it after an upload', async () => {
    const api = fast();
    const before = await api.getSchedule(12);
    expect(before.months[0]!.month).toBe('2026-10');
    expect(before.plans.map((p) => p.plan_id).sort()).toEqual(['pl_02', 'pl_03']);

    await api.uploadStatement(pdf());
    const after = await api.getSchedule(12);
    expect(after.months[0]!.month).toBe('2026-11');
    expect(after.months.slice(0, 4).map((m) => m.total)).toEqual([699726, 699726, 350000, 350000]);
    expect(after.months.at(-1)!.total).toBe(0);
    const cash = after.plans.find((p) => p.kind === 'cash_advance')!;
    expect(cash).toMatchObject({ remaining_count: 2, ends: '2026-12', total_remaining: 699452 });

    const reading = readSchedule(after);
    expect(reading.total).toBe(2899452);
    expect(reading.peak).toEqual({ month: '2026-11', total: 699726 });
    expect(reading.after).toEqual({ month: '2027-01', max: 350000 });
  });

  it('refuses the same statement twice and unknown layouts', async () => {
    const api = fast();
    await api.uploadStatement(pdf());
    await expect(api.uploadStatement(pdf())).rejects.toMatchObject({ code: 'duplicate', status: 409 });
    await expect(api.uploadStatement(pdf('bilinmeyen.pdf'))).rejects.toBeInstanceOf(ApiError);
  });

  it('finds subscriptions and the price rise', async () => {
    const api = fast();
    await api.uploadStatement(pdf());
    const { items } = await api.getSubscriptions();
    const stream = items.find((s) => s.merchant === 'STREAMFLIX')!;
    expect(stream).toMatchObject({ amount_previous: 14999, amount_last: 17999, price_change: '0.20' });
    expect(items.find((s) => s.merchant === 'MUZIKBOX')!.price_change).toBeNull();
  });

  it('summarises a month against the previous one', async () => {
    const api = fast();
    const sep = await api.getMonthlySummary('2026-09');
    expect(sep.total_spend).toBe(768317);
    expect(sep.previous_month?.total_spend).toBe(941563);
    expect(sep.by_category[0]!.category).toBe('electronics');
  });

  it('adds a manual installment plan to the schedule', async () => {
    const api = fast();
    await api.uploadStatement(pdf());
    await api.createTransaction({
      date: '2026-11-20',
      description: 'TELEFON-ORNEK',
      amount: 1200000,
      currency: 'TRY',
      direction: 'debit',
      installment: { total_count: 6, amount_each: 200000 },
    });
    const schedule = await api.getSchedule(12);
    const plan = schedule.plans.find((p) => p.description === 'TELEFON-ORNEK')!;
    expect(plan).toMatchObject({ remaining_count: 6, ends: '2027-04', total_remaining: 1200000 });
    expect(schedule.months[0]!.total).toBe(899726);
  });

  it('runs an analysis job only when a provider is chosen', async () => {
    const api = fast();
    await expect(api.analyzeStatement('st_08')).rejects.toMatchObject({ code: 'no_provider' });
    await expect(api.selectProvider('gemini-cli')).rejects.toMatchObject({ code: 'provider_unavailable' });
    await api.selectProvider('claude-cli');
    await api.uploadStatement(pdf());
    const { job_id } = await api.analyzeStatement('st_10');
    await new Promise((r) => setTimeout(r, 5));
    expect((await api.getJob(job_id)).status).toBe('done');
    const analysis = await api.getAnalysis('st_10');
    expect(analysis.commentary.watch_items.length).toBe(4);
    expect(analysis.provider).toBe('claude-cli');
  });
});
