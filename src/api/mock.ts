// In-repo fixture adapter. It behaves like kalan-back closely enough for the UI:
// the schedule, monthly summary and subscriptions are derived from the stored
// statements, so uploading a statement or adding a manual plan changes them.
import {
  ApiError,
  type Analysis,
  type KalanApi,
  type MonthlySummary,
  type NewTransaction,
  type ProviderId,
  type Schedule,
  type ScheduleItem,
  type SchedulePlan,
  type Settings,
  type Statement,
  type StatementSummary,
  type Subscription,
  type Transaction,
} from './types';
import {
  analysisTexts,
  defaultSettings,
  PLAN_BREAKDOWNS,
  PLAN_KINDS,
  providers as fixtureProviders,
  statement08,
  statement09,
  statement10,
} from './fixtures';
import { addMonths, monthOf, monthsBetween } from '../lib/month';

export interface MockOptions {
  /** Delay for ordinary reads and writes, in ms. */
  latency?: number;
  /** Total simulated upload and parse time, in ms. */
  uploadMs?: number;
  /** Time the simulated model call takes, in ms. */
  analysisMs?: number;
}

const PLAN_META: Record<string, { count: number; description: string }> = {
  pl_01: { count: 3, description: 'Mobil taksitli nakit avans' },
  pl_02: { count: 12, description: 'ELEKTRO-ORNEK DIZUSTU' },
  pl_03: { count: 6, description: 'MOBILYA-ORNEK KITAPLIK' },
};

interface ManualPlan {
  plan_id: string;
  description: string;
  count: number;
  amount_each: number;
  first_month: string;
}

const clone = <T>(value: T): T => structuredClone(value);
const ratio = (value: number) => (Number.isFinite(value) ? value.toFixed(2) : '0.00');
const countsAsSpend = (tx: Transaction) => tx.direction === 'debit' && tx.kind !== 'payment' && tx.kind !== 'carry_over';

export function createMockApi(options: MockOptions = {}): KalanApi {
  const latency = options.latency ?? 220;
  const uploadMs = options.uploadMs ?? 1400;
  const analysisMs = options.analysisMs ?? 6000;

  const state = {
    selected: null as ProviderId | null,
    settings: clone<Settings>(defaultSettings),
    statements: [clone(statement08), clone(statement09)] as Statement[],
    manualTransactions: [] as Transaction[],
    manualPlans: [] as ManualPlan[],
    analyses: new Map<string, Analysis>(),
    jobs: new Map<string, { status: 'pending' | 'done' | 'failed'; error: string | null }>(),
    nextId: 1,
  };
  state.analyses.set('st_09', {
    categories_applied: true,
    commentary: clone(analysisTexts.st_09!.tr),
    provider: 'claude-cli',
    created_at: '2026-10-01T09:14:00Z',
  });

  const wait = <T>(value: T, ms = latency): Promise<T> =>
    new Promise((resolve) => setTimeout(() => resolve(clone(value)), ms));
  const fail = (status: number, code: string, message: string, details: Record<string, unknown> = {}) =>
    new Promise<never>((_, reject) => setTimeout(() => reject(new ApiError(status, code, message, details)), latency));

  const sorted = () => [...state.statements].sort((a, b) => a.period_end.localeCompare(b.period_end));
  const findStatement = (id: string) => state.statements.find((s) => s.id === id);
  const providersResponse = () => ({ providers: fixtureProviders, selected: state.selected });

  function schedule(months: number): Schedule {
    const list = sorted();
    const latest = list.at(-1);
    const lastBilled = latest ? monthOf(latest.period_end) : '2026-10';
    const start = addMonths(lastBilled, 1);
    const window = Array.from({ length: months }, (_, i) => addMonths(start, i));

    interface Line {
      plan: SchedulePlan;
      indexAt: (month: string) => number;
      count: number;
    }
    const lines: Line[] = [];

    const latestInstallment = new Map<string, { tx: Transaction; month: string }>();
    for (const st of list) {
      for (const tx of st.transactions) {
        if (tx.installment) latestInstallment.set(tx.installment.plan_id, { tx, month: monthOf(st.period_end) });
      }
    }
    for (const [planId, { tx, month }] of latestInstallment) {
      const info = tx.installment!;
      if (info.remaining_count <= 0) continue;
      const meta = PLAN_META[planId] ?? { count: info.remaining_count + 1, description: tx.description };
      const billedIndex = meta.count - info.remaining_count;
      const breakdown = PLAN_BREAKDOWNS[planId];
      lines.push({
        count: meta.count,
        indexAt: (m) => billedIndex + monthsBetween(month, m),
        plan: {
          plan_id: planId,
          description: meta.description,
          kind: PLAN_KINDS[planId] ?? 'purchase',
          remaining_count: info.remaining_count,
          amount_each: info.remaining_amount_each,
          ends: addMonths(month, info.remaining_count),
          total_remaining: info.remaining_count * info.remaining_amount_each,
          ...(breakdown ? { breakdown } : {}),
        },
      });
    }
    for (const mp of state.manualPlans) {
      const first = monthsBetween(start, mp.first_month) > 0 ? mp.first_month : start;
      const billed = Math.max(0, monthsBetween(first, start));
      const remaining = mp.count - billed;
      if (remaining <= 0) continue;
      lines.push({
        count: mp.count,
        indexAt: (m) => 1 + monthsBetween(first, m),
        plan: {
          plan_id: mp.plan_id,
          description: mp.description,
          kind: 'purchase',
          remaining_count: remaining,
          amount_each: mp.amount_each,
          ends: addMonths(first, mp.count - 1),
          total_remaining: remaining * mp.amount_each,
        },
      });
    }

    const monthsOut = window.map((month) => {
      const items: ScheduleItem[] = [];
      for (const line of lines) {
        const index = line.indexAt(month);
        if (index >= 1 && index <= line.count) {
          items.push({
            plan_id: line.plan.plan_id,
            description: line.plan.description,
            amount: line.plan.amount_each,
            index,
            count: line.count,
            ...(line.plan.breakdown ? { breakdown: line.plan.breakdown } : {}),
          });
        }
      }
      return { month, total: items.reduce((s, it) => s + it.amount, 0), items };
    });

    return {
      currency: 'TRY',
      months: monthsOut,
      plans: lines.map((l) => l.plan).sort((a, b) => a.ends.localeCompare(b.ends)),
    };
  }

  function monthTransactions(month: string) {
    const statements = state.statements.filter((s) => monthOf(s.period_end) === month);
    const txs = [
      ...statements.flatMap((s) => s.transactions),
      ...state.manualTransactions.filter((t) => monthOf(t.date) === month),
    ];
    return { statements, txs };
  }

  function spendOf(txs: Transaction[]) {
    return txs.filter(countsAsSpend).reduce((s, t) => s + t.amount, 0);
  }

  function summary(month: string): MonthlySummary {
    const { statements, txs } = monthTransactions(month);
    const total = spendOf(txs);
    const byCat = new Map<string, number>();
    for (const tx of txs.filter(countsAsSpend)) {
      const key = tx.category ?? 'other';
      byCat.set(key, (byCat.get(key) ?? 0) + tx.amount);
    }
    const prevTxs = monthTransactions(addMonths(month, -1));
    const prevTotal = prevTxs.statements.length ? spendOf(prevTxs.txs) : 0;
    return {
      month,
      currency: 'TRY',
      total_spend: total,
      total_credit: txs.filter((t) => t.kind === 'refund').reduce((s, t) => s + t.amount, 0),
      by_category: [...byCat.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([category, amount]) => ({ category, amount, share: ratio(total ? amount / total : 0) })),
      previous_month: prevTxs.statements.length
        ? { total_spend: prevTotal, change: ratio((total - prevTotal) / prevTotal) }
        : null,
      statement_ids: statements.map((s) => s.id),
    };
  }

  function subscriptions(): Subscription[] {
    const byMerchant = new Map<string, Map<string, number>>();
    for (const st of sorted()) {
      for (const tx of st.transactions) {
        if (tx.category !== 'subscriptions' || !tx.merchant || !countsAsSpend(tx)) continue;
        const months = byMerchant.get(tx.merchant) ?? new Map<string, number>();
        months.set(monthOf(st.period_end), tx.amount);
        byMerchant.set(tx.merchant, months);
      }
    }
    const items: Subscription[] = [];
    for (const [merchant, months] of byMerchant) {
      const seen = [...months.keys()].sort();
      if (seen.length < 2) continue;
      const last = months.get(seen.at(-1)!)!;
      const previous = months.get(seen.at(-2)!)!;
      items.push({
        merchant,
        amount_last: last,
        amount_previous: previous,
        currency: 'TRY',
        months_seen: seen,
        price_change: last === previous ? null : ratio((last - previous) / previous),
      });
    }
    return items.sort((a, b) => b.amount_last - a.amount_last);
  }

  return {
    health: () => wait({ status: 'ok', version: '0.1.0-mock' }),
    getProviders: () => wait(providersResponse()),
    selectProvider: (id) => {
      const provider = fixtureProviders.find((p) => p.id === id);
      if (!provider) return fail(404, 'not_found', 'Unknown provider.');
      if (!provider.available) return fail(409, 'provider_unavailable', `${provider.name} is not available on this computer.`);
      state.selected = id;
      return wait(providersResponse());
    },
    getSettings: () => wait(state.settings),
    putSettings: (settings) => {
      state.settings = clone(settings);
      return wait(state.settings);
    },
    uploadStatement: (file, opts = {}) => {
      const name = file.name.toLowerCase();
      if (file.size > 10 * 1024 * 1024) return fail(413, 'file_too_large', 'The file is larger than 10 MB.');
      return new Promise((resolve, reject) => {
        const steps = 8;
        let step = 0;
        const tick = () => {
          step += 1;
          opts.onProgress?.(Math.min(1, step / steps));
          if (step < steps) {
            timer = setTimeout(tick, uploadMs / steps);
            return;
          }
          if (name.includes('bilinmeyen') || name.includes('unknown')) {
            reject(new ApiError(422, 'unknown_format', 'No parser matched this PDF.'));
            return;
          }
          if (findStatement(statement10.id)) {
            reject(
              new ApiError(409, 'duplicate', 'This statement is already stored.', {
                bank: statement10.bank,
                card_last4: statement10.card_last4,
                period_end: statement10.period_end,
                existing_id: statement10.id,
              }),
            );
            return;
          }
          const stored = clone(statement10);
          state.statements.push(stored);
          resolve(clone(stored));
        };
        let timer = setTimeout(tick, uploadMs / steps);
        opts.signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new ApiError(0, 'aborted', 'Upload cancelled.'));
        });
      });
    },
    listStatements: () =>
      wait({
        items: sorted()
          .reverse()
          .map((s): StatementSummary => {
            const copy: Partial<Statement> = { ...s };
            delete copy.transactions;
            delete copy.interest_rates;
            return copy as StatementSummary;
          }),
      }),
    getStatement: (id) => {
      const st = findStatement(id);
      return st ? wait(st) : fail(404, 'not_found', 'Statement not found.');
    },
    deleteStatement: (id) => {
      state.statements = state.statements.filter((s) => s.id !== id);
      state.analyses.delete(id);
      return wait(undefined);
    },
    createTransaction: (body: NewTransaction) => {
      if (!body.description.trim() || body.amount <= 0) {
        return fail(422, 'invalid', 'Description and a positive amount are required.');
      }
      const id = `tx_m_${state.nextId++}`;
      let installment: Transaction['installment'] = null;
      if (body.installment && body.installment.total_count > 1) {
        const planId = `pl_m_${state.nextId++}`;
        const nextDue = schedule(1).months[0]?.month ?? monthOf(body.date);
        const firstMonth = monthsBetween(nextDue, monthOf(body.date)) > 0 ? monthOf(body.date) : nextDue;
        state.manualPlans.push({
          plan_id: planId,
          description: body.description,
          count: body.installment.total_count,
          amount_each: body.installment.amount_each,
          first_month: firstMonth,
        });
        installment = {
          plan_id: planId,
          remaining_count: body.installment.total_count,
          remaining_amount_each: body.installment.amount_each,
          is_last: false,
        };
      }
      const tx: Transaction = {
        id,
        date: body.date,
        description: body.description,
        amount: body.amount,
        currency: body.currency,
        direction: body.direction,
        kind: installment ? 'installment' : 'purchase',
        installment,
        category: null,
        merchant: null,
        source: 'manual',
      };
      state.manualTransactions.push(tx);
      return wait(tx);
    },
    deleteTransaction: (id) => {
      const tx = state.manualTransactions.find((t) => t.id === id);
      if (!tx) return fail(404, 'not_found', 'Only manual transactions can be deleted.');
      state.manualTransactions = state.manualTransactions.filter((t) => t.id !== id);
      if (tx.installment) state.manualPlans = state.manualPlans.filter((p) => p.plan_id !== tx.installment!.plan_id);
      return wait(undefined);
    },
    getSchedule: (months) => wait(schedule(months)),
    getMonthlySummary: (month) => wait(summary(month)),
    getSubscriptions: () => wait({ items: subscriptions() }),
    analyzeStatement: (id) => {
      const st = findStatement(id);
      if (!st) return fail(404, 'not_found', 'Statement not found.');
      if (!state.selected) return fail(409, 'no_provider', 'Choose an AI provider first.');
      const jobId = `job_${state.nextId++}`;
      const provider = state.selected;
      st.analysis_status = 'pending';
      state.jobs.set(jobId, { status: 'pending', error: null });
      setTimeout(() => {
        const texts = analysisTexts[id];
        const commentary = texts
          ? clone(texts[state.settings.locale])
          : { locale: state.settings.locale, summary: '', watch_items: [] };
        state.analyses.set(id, { categories_applied: true, commentary, provider, created_at: new Date().toISOString() });
        st.analysis_status = 'done';
        state.jobs.set(jobId, { status: 'done', error: null });
      }, analysisMs);
      return wait({ job_id: jobId, status: 'pending' as const });
    },
    getJob: (jobId) => {
      const job = state.jobs.get(jobId);
      return job ? wait(job) : fail(404, 'not_found', 'Job not found.');
    },
    getAnalysis: (id) => {
      const analysis = state.analyses.get(id);
      return analysis ? wait(analysis) : fail(404, 'not_found', 'No analysis for this statement yet.');
    },
  };
}
