import { describe, expect, it } from 'vitest';
import { createMockApi } from './mock';
import { isApiError } from './types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('mock v0.4.0: cards', () => {
  it('derives one card per bank and last four, with a label, and takes a name', async () => {
    const api = createMockApi({ latency: 0, preset: 'full' });
    const { items } = await api.listCards();
    expect(items.map((c) => c.label)).toEqual(['Denemebank Deneme Kart ··1111', 'Örnekbank Örnek Kart ··0000']);
    expect(items[0]).toMatchObject({ statement_count: 3, first_month: '2026-07', last_month: '2026-10' });
    const renamed = await api.renameCard(items[0]!.id, 'Market kartım');
    expect(renamed.label).toBe('Market kartım ··1111');
    const st = (await api.listStatements()).items.find((s) => s.card_id === items[0]!.id)!;
    expect(st.card_label).toBe('Market kartım ··1111');
    expect((await api.renameCard(items[0]!.id, '')).label).toBe('Denemebank Deneme Kart ··1111');
    await expect(api.renameCard('cd_none', 'x')).rejects.toSatisfy((e) => isApiError(e, 'card_not_found'));
  });
});

describe('mock v0.4.0: plans', () => {
  it('closes a plan by the statement when a newer statement of the card lacks it', async () => {
    const api = createMockApi({ latency: 0, preset: 'full' });
    const s = await api.getSchedule(12);
    const tek = s.plans.find((p) => p.plan_id === 'pl_ai_01')!;
    expect(tek).toMatchObject({ closed: 'statement', statement_id: 'st_k2_10', next_month: null, next_amount: 0 });
    expect(s.plans.at(-1)!.plan_id).toBe('pl_ai_01');
    expect(s.months.flatMap((m) => m.items).some((it) => it.plan_id === 'pl_ai_01')).toBe(false);
    await expect(api.closePlan('pl_ai_01')).rejects.toSatisfy((e) => isApiError(e, 'closed_by_statement'));
  });

  it('closes and reopens a plan for the user, and every total follows', async () => {
    const api = createMockApi({ latency: 0, preset: 'full' });
    const before = await api.getSchedule(12);
    const giyim = before.plans.find((p) => p.plan_id === 'pl_k2_01')!;
    expect(giyim).toMatchObject({ total_count: 3, paid_count: 1, next_month: '2026-11', closed: null });
    const closed = await api.closePlan('pl_k2_01');
    expect(closed).toMatchObject({ closed: 'user' });
    const after = await api.getSchedule(12);
    expect(after.summary!.total_remaining).toBe(before.summary!.total_remaining - giyim.total_remaining);
    expect(after.months[0]!.total).toBe(before.months[0]!.total - giyim.amount_each);
    await api.reopenPlan('pl_k2_01');
    expect((await api.getSchedule(12)).summary).toEqual(before.summary);
    await expect(api.reopenPlan('pl_k2_01')).rejects.toSatisfy((e) => isApiError(e, 'plan_not_closed'));
  });
});

describe('mock v0.4.0: what you pay and regular payments', () => {
  it('gives one row per card: the stored statement while it is due, else the next statement forecast', async () => {
    const api = createMockApi({ latency: 0, preset: 'full' });
    const f = await api.getForecast(true);
    expect(f.cards!.map((c) => [c.card_label, c.estimated, c.due_date])).toEqual([
      ['Denemebank Deneme Kart ··1111', false, '2026-11-10'],
      ['Örnekbank Örnek Kart ··0000', true, '2026-12-04'],
    ]);
    expect(f.total).toBe(f.cards!.reduce((n, c) => n + c.amount, 0));
    const est = f.cards![1]!;
    expect(est.amount).toBe(est.parts!.installments + est.parts!.subscriptions + est.parts!.other);
  });

  it('splits subscriptions from bills and uses an expected amount', async () => {
    const api = createMockApi({ latency: 0, preset: 'full' });
    const { items, totals } = await api.getSubscriptions();
    expect(items.filter((s) => s.kind === 'bill').map((s) => s.merchant)).toEqual(['ORNEK ELEKTRIK']);
    const stream = items.find((s) => s.merchant === 'STREAMFLIX')!;
    await api.setSubscriptionExpected(stream.id!, 9999);
    const next = await api.getSubscriptions();
    expect(next.items.find((s) => s.id === stream.id)).toMatchObject({ expected_amount: 9999, monthly_amount: 9999 });
    expect(next.totals![0]!.subscription).toBe(totals![0]!.subscription - stream.amount_last + 9999);
    expect((await api.getAlerts()).items.some((a) => a.kind === 'subscription_price_rise')).toBe(false);
    await api.clearSubscriptionExpected(stream.id!);
    await expect(api.clearSubscriptionExpected(stream.id!)).rejects.toSatisfy((e) => isApiError(e, 'expected_not_set'));
  });

  it('reports a gap as one missing_statement alert per card with a plain sentence', async () => {
    const api = createMockApi({ latency: 0, preset: 'full' });
    const missing = (await api.getAlerts()).items.filter((a) => a.kind === 'missing_statement');
    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatchObject({ params: { from: '2026-08', to: '2026-08', months: 1 }, card_label: 'Denemebank Deneme Kart ··1111' });
    expect(missing[0]!.text).toContain('Ağustos 2026 ekstresi yok');
  });
});

describe('mock v0.4.0: suggestions and the AI batch', () => {
  it('writes rule suggestions without a provider, most saving first', async () => {
    const api = createMockApi({ latency: 0, preset: 'basic' });
    const { items, ai } = await api.getSuggestions('tr');
    expect(ai.status).toBe('none');
    expect(items.every((s) => s.source === 'rules')).toBe(true);
    const savings = items.map((s) => s.monthly_saving ?? -1);
    expect(savings).toEqual([...savings].sort((a, b) => b - a));
  });

  it('reads every statement in one batch, fills categories and adds AI suggestions', async () => {
    const api = createMockApi({ latency: 0, preset: 'basic', analysisMs: 40 });
    await expect(api.startAnalysisAll()).rejects.toSatisfy((e) => isApiError(e, 'no_provider'));
    await api.selectProvider('claude-cli');
    const started = await api.startAnalysisAll();
    expect(started.total).toBeGreaterThan(0);
    expect((await api.getAnalysisAll())).toMatchObject({ status: 'pending', phase: 'statements' });
    for (let i = 0; i < 50 && (await api.getAnalysisAll())?.status === 'pending'; i += 1) await sleep(20);
    expect(await api.getJob(started.job_id)).toMatchObject({ status: 'done', phase: 'done', done: started.total });
    expect((await api.listStatements()).items.every((s) => s.analysis_status === 'done')).toBe(true);
    const { items, ai } = await api.getSuggestions('tr');
    expect(ai.status).toBe('done');
    expect(items.filter((s) => s.source === 'ai').every((s) => s.monthly_saving === null)).toBe(true);
  });
});
