// In-repo fixture adapter. It behaves like kalan-back closely enough for the UI: the schedule, monthly
// summary, subscriptions, alerts and insights are derived from the stored statements, imports, manual rows
// and fixed costs, so uploading a statement or adding a plan changes them.
//
// Scenario switches for screens (all invented data):
// - upload file name with "sifreli" / "encrypted": encrypted PDF, password MOCK_PDF_PASSWORD ("000000")
// - "engel" / "blocked": 422 save_blocked (hard + soft findings)
// - "bilinmeyen" / "unknown": no parser; AI fallback when a provider is selected, else 422 unknown_format
// - "kart2" / "deneme": the second card (denemebank 1111) with a refunded annual fee
// - anything else: the October statement (needs_review: printed total 149,99 TL above the rows)
// - preset "full": all of the above stored, fixed costs, a cancelled subscription, a provider selected
// - preset "empty": no statement, no provider (the first run of the overview)
// The mock clock is the day before the latest due date, so due_soon is always critical.
import {
  AI_FALLBACK_PARSER,
  ApiError,
  type Alert,
  type Analysis,
  type CancelledSubscription,
  type CardFee,
  type CardFeePrompt,
  type CategoryRule,
  type FixedCost,
  type ImportSummary,
  type IsoDate,
  type IsoMonth,
  type KalanApi,
  type MonthlySummary,
  type NewTransaction,
  type ProviderId,
  type RuleOverrides,
  type Schedule,
  type ScheduleItem,
  type SchedulePlan,
  type Settings,
  type Statement,
  type StatementSummary,
  type Subscription,
  type Transaction,
  type UploadOptions,
  type UploadResult,
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
import {
  blockedIssues,
  cancelledFixture,
  CATEGORY_LIST,
  diagnosisFixture,
  fixedCostsFixture,
  HAKEM_HEYETI_LIMIT,
  insightRulesFixture,
  MOCK_BANKS,
  MOCK_PDF_PASSWORD,
  pdfPasswordHints,
  sampleCategoryRule,
  statementAiFallback,
  statementCard2,
  templateDraftYaml,
} from './fixtures-v03';
import {
  addDays,
  cardOption,
  countsAsSpend,
  dateIn,
  daysBetween,
  EXPORT_MEDIA,
  exportText,
  fold,
  matchesWords,
  matchFixedCosts,
  median,
  minimumCycles,
  parseCsv,
  ratio,
  shareSentence,
  shareSvg,
  simulate,
} from './mock-calc';
import { addMonths, monthOf, monthsBetween } from '../lib/month';

export type MockPreset = 'empty' | 'basic' | 'full';

export interface MockOptions {
  /** Delay for ordinary reads and writes, in ms. */
  latency?: number;
  /** Total simulated upload and parse time, in ms. */
  uploadMs?: number;
  /** Time the simulated model call takes, in ms. */
  analysisMs?: number;
  /** `basic` (default): two statements. `full`: every scenario stored. `empty`: nothing stored, no provider (first run). */
  preset?: MockPreset;
  /** Fixed "today" (YYYY-MM-DD). Default: the day before the latest due date. */
  today?: IsoDate;
}

const PLAN_META: Record<string, { count: number; description: string }> = {
  pl_01: { count: 3, description: 'Mobil taksitli nakit avans' },
  pl_02: { count: 12, description: 'ELEKTRO-ORNEK DIZUSTU' },
  pl_03: { count: 6, description: 'MOBILYA-ORNEK KITAPLIK' },
  pl_k2_01: { count: 3, description: 'ORNEK GIYIM' },
  pl_ai_01: { count: 4, description: 'ORNEK TEKNOLOJI' },
};

interface ManualPlan {
  plan_id: string;
  description: string;
  count: number;
  amount_each: number;
  first_month: string;
}

interface ImportBatch {
  summary: ImportSummary;
  transactions: Transaction[];
}

const clone = <T>(value: T): T => structuredClone(value);
const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 } as const;
const FEE_WORDS = ['aidat', 'yillik kart ucreti', 'uyelik ucreti'];

function pickStatement(name: string): Statement {
  if (name.includes('bilinmeyen') || name.includes('unknown')) return statementAiFallback;
  if (name.includes('kart2') || name.includes('deneme')) return statementCard2;
  return statement10;
}

export function createMockApi(options: MockOptions = {}): KalanApi {
  const latency = options.latency ?? 220;
  const uploadMs = options.uploadMs ?? 1400;
  const analysisMs = options.analysisMs ?? 6000;
  const full = options.preset === 'full';

  const state = {
    selected: (full ? 'claude-cli' : null) as ProviderId | null,
    settings: clone<Settings>(defaultSettings),
    statements: (options.preset === 'empty'
      ? []
      : full
        ? [statement08, statement09, statement10, statementAiFallback, statementCard2]
        : [statement08, statement09]
    ).map((s) => clone(s)),
    manualTransactions: [] as Transaction[],
    manualPlans: [] as ManualPlan[],
    imports: [] as ImportBatch[],
    fixedCosts: full ? clone(fixedCostsFixture) : ([] as FixedCost[]),
    rules: full ? [clone(sampleCategoryRule)] : ([] as CategoryRule[]),
    cancelled: full ? clone(cancelledFixture) : ([] as CancelledSubscription[]),
    overrides: clone<RuleOverrides>(insightRulesFixture.overrides),
    remembered: new Set<string>(),
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
  /** Runs `body` after the latency; an ApiError it throws becomes the rejection. */
  const later = <T>(body: () => T): Promise<T> =>
    new Promise((resolve, reject) =>
      setTimeout(() => {
        try {
          resolve(clone(body()));
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      }, latency),
    );

  const sorted = () => [...state.statements].sort((a, b) => a.period_end.localeCompare(b.period_end));
  const findStatement = (id: string) => state.statements.find((s) => s.id === id);
  const providersResponse = () => ({ providers: fixtureProviders, selected: state.selected });
  const importRows = () => state.imports.flatMap((b) => b.transactions);
  const looseRows = () => [...state.manualTransactions, ...importRows()];
  const allRows = () => [...state.statements.flatMap((s) => s.transactions), ...looseRows()];
  const cardKey = (s: Statement) => `${s.bank}:${s.card_last4}`;

  function latestPerCard(): Statement[] {
    const latest = new Map<string, Statement>();
    for (const st of sorted()) latest.set(cardKey(st), st);
    return [...latest.values()];
  }

  function today(): IsoDate {
    if (options.today) return options.today;
    const latestDue = state.statements.map((s) => s.due_date).sort().at(-1);
    return latestDue ? addDays(latestDue, -1) : '2026-10-04';
  }

  function requireProvider(): ProviderId {
    if (!state.selected) throw new ApiError(409, 'no_provider', 'Choose an AI provider first (PUT /providers/selected).');
    const provider = fixtureProviders.find((p) => p.id === state.selected);
    if (!provider?.available) {
      throw new ApiError(409, 'provider_unavailable', 'The selected provider is not available on this computer.', { id: state.selected });
    }
    return state.selected;
  }

  // -- schedule -----------------------------------------------------------------------------------

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
      each: ScheduleItem['breakdown'];
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
      const each = PLAN_BREAKDOWNS[planId] ?? null;
      lines.push({
        count: meta.count,
        each,
        indexAt: (m) => billedIndex + monthsBetween(month, m),
        plan: {
          plan_id: planId,
          description: meta.description,
          kind: PLAN_KINDS[planId] ?? 'purchase',
          remaining_count: info.remaining_count,
          amount_each: info.remaining_amount_each,
          ends: addMonths(month, info.remaining_count),
          total_remaining: info.remaining_count * info.remaining_amount_each,
          // Contract: the plan breakdown covers the remaining total, the item breakdown one month.
          breakdown: each
            ? {
                principal: each.principal * info.remaining_count,
                interest: each.interest * info.remaining_count,
                bsmv: each.bsmv * info.remaining_count,
                kkdf: each.kkdf * info.remaining_count,
              }
            : null,
          source: 'statement',
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
        each: null,
        indexAt: (m) => 1 + monthsBetween(first, m),
        plan: {
          plan_id: mp.plan_id,
          description: mp.description,
          kind: 'purchase',
          remaining_count: remaining,
          amount_each: mp.amount_each,
          ends: addMonths(first, mp.count - 1),
          total_remaining: remaining * mp.amount_each,
          breakdown: null,
          source: 'manual',
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
            breakdown: line.each,
          });
        }
      }
      return { month, total: items.reduce((s, it) => s + it.amount, 0), items };
    });

    const fixedMonths = window.map((month) => {
      const items = state.fixedCosts
        .filter((c) => month >= c.start && (c.end === null || month <= c.end))
        .map((c) => ({ fixed_cost_id: c.id, name: c.name, amount: c.amount, currency: c.currency, date: dateIn(month, c.day) }));
      return { month, total: items.filter((i) => i.currency === 'TRY').reduce((s, i) => s + i.amount, 0), items };
    });

    return {
      currency: 'TRY',
      start_month: start,
      months: monthsOut,
      plans: lines.map((l) => l.plan).sort((a, b) => a.ends.localeCompare(b.ends)),
      fixed: { kind: 'fixed', months: fixedMonths },
    };
  }

  // -- summaries ----------------------------------------------------------------------------------

  function monthTransactions(month: string) {
    const statements = state.statements.filter((s) => monthOf(s.period_end) === month);
    const txs = [...statements.flatMap((s) => s.transactions), ...looseRows().filter((t) => monthOf(t.date) === month)];
    return { statements, txs };
  }

  const spendOf = (txs: Transaction[]) => txs.filter(countsAsSpend).reduce((s, t) => s + t.amount, 0);

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

  // -- alerts -------------------------------------------------------------------------------------

  function alerts(): Alert[] {
    const out: Alert[] = [];
    const add = (alert: Omit<Alert, 'message_key' | 'refs'> & { refs?: Partial<Alert['refs']> }) =>
      out.push({
        ...alert,
        message_key: `alert.${alert.kind}`,
        refs: { statement_ids: [], transaction_ids: [], plan_ids: [], ...alert.refs },
      });
    const now = today();
    const sched = schedule(12);
    const nextMonth = sched.months[0]?.month;

    for (const plan of sched.plans.filter((p) => p.ends === nextMonth)) {
      add({
        id: `al_installment_ending_${plan.plan_id}`,
        kind: 'installment_ending',
        severity: 'info',
        month: plan.ends,
        params: { description: plan.description, amount_each: plan.amount_each, currency: sched.currency, kind: plan.kind },
        refs: { plan_ids: [plan.plan_id] },
      });
    }

    for (const st of latestPerCard()) {
      const month = monthOf(st.period_end);
      const refs = { statement_ids: [st.id] };
      if (st.credit_limit) {
        const share = st.statement_total / st.credit_limit;
        if (share > 0.8) {
          add({
            id: `al_limit_high_${st.id}`,
            kind: 'limit_high',
            severity: share >= 1 ? 'critical' : 'warning',
            month,
            params: { used_share: ratio(share), statement_total: st.statement_total, credit_limit: st.credit_limit, currency: st.currency },
            refs,
          });
        }
      }
      const byKind = (kind: Transaction['kind']) => st.transactions.filter((t) => t.kind === kind && t.direction === 'debit');
      const pairs = [
        ['interest', 'interest_charged', 'warning'],
        ['fee', 'fee_charged', 'info'],
        ['tax', 'tax_charged', 'info'],
      ] as const;
      for (const [kind, alertKind, severity] of pairs) {
        const rows = byKind(kind);
        if (!rows.length) continue;
        add({
          id: `al_${alertKind}_${st.id}`,
          kind: alertKind,
          severity,
          month,
          params: { count: rows.length, total: rows.reduce((s, t) => s + t.amount, 0), currency: st.currency },
          refs: { ...refs, transaction_ids: rows.map((t) => t.id) },
        });
      }
      const foreign = st.transactions.filter((t) => t.original_currency);
      if (foreign.length) {
        add({
          id: `al_foreign_currency_${st.id}`,
          kind: 'foreign_currency',
          severity: 'info',
          month,
          params: {
            count: foreign.length,
            currencies: [...new Set(foreign.map((t) => t.original_currency!))],
            total: foreign.reduce((s, t) => s + t.amount, 0),
            currency: st.currency,
          },
          refs: { ...refs, transaction_ids: foreign.map((t) => t.id) },
        });
      }
      const daysLeft = daysBetween(now, st.due_date);
      if (daysLeft >= 0 && daysLeft <= 5 && st.statement_total > 0) {
        add({
          id: `al_due_soon_${st.id}`,
          kind: 'due_soon',
          severity: daysLeft <= 1 ? 'critical' : 'warning',
          month,
          params: {
            due_date: st.due_date,
            days_left: daysLeft,
            statement_total: st.statement_total,
            minimum_payment: st.minimum_payment,
            currency: st.currency,
          },
          refs,
        });
      }
      const expected = st.next_period_end ?? dateIn(addMonths(month, 1), Number(st.period_end.slice(8, 10)));
      const overdue = daysBetween(expected, now);
      if (overdue > 7) {
        add({
          id: `al_statement_overdue_${st.id}`,
          kind: 'statement_overdue',
          severity: 'warning',
          month: monthOf(expected),
          params: { bank: st.bank, card_last4: st.card_last4, expected_cut_off: expected, days_overdue: overdue },
          refs,
        });
      }
    }

    const byCard = new Map<string, Statement[]>();
    for (const st of sorted()) byCard.set(cardKey(st), [...(byCard.get(cardKey(st)) ?? []), st]);
    for (const list of byCard.values()) {
      for (let i = 1; i < list.length; i += 1) {
        const gap = monthsBetween(monthOf(list[i - 1]!.period_end), monthOf(list[i]!.period_end));
        for (let k = 1; k < gap; k += 1) {
          const missing = addMonths(monthOf(list[i - 1]!.period_end), k);
          add({
            id: `al_missing_statement_${list[i]!.bank}_${list[i]!.card_last4}_${missing}`,
            kind: 'missing_statement',
            severity: 'warning',
            month: missing,
            params: { bank: list[i]!.bank, card_last4: list[i]!.card_last4 },
            refs: { statement_ids: [list[i - 1]!.id, list[i]!.id] },
          });
        }
      }
    }

    for (const sub of subscriptions().filter((s) => s.amount_last > s.amount_previous)) {
      add({
        id: `al_subscription_price_rise_${fold(sub.merchant)}`,
        kind: 'subscription_price_rise',
        severity: 'info',
        month: sub.months_seen.at(-1)!,
        params: {
          merchant: sub.merchant,
          amount_previous: sub.amount_previous,
          amount_last: sub.amount_last,
          price_change: sub.price_change,
          currency: sub.currency,
        },
      });
    }

    for (const c of state.cancelled) {
      const rows = allRows().filter(
        (t) => t.direction === 'debit' && t.merchant && fold(t.merchant).includes(fold(c.merchant)) && t.date > c.cancelled_on,
      );
      if (!rows.length) continue;
      add({
        id: `al_charged_after_cancel_${fold(c.merchant)}`,
        kind: 'charged_after_cancel',
        severity: 'critical',
        month: monthOf(rows.at(-1)!.date),
        params: {
          merchant: c.merchant,
          cancelled_on: c.cancelled_on,
          count: rows.length,
          total: rows.reduce((s, t) => s + t.amount, 0),
          currency: rows[0]!.currency,
        },
        refs: { transaction_ids: rows.map((t) => t.id) },
      });
    }

    return out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.month.localeCompare(b.month));
  }

  // -- categories ---------------------------------------------------------------------------------

  /** Applies the user rules to statement and import rows; returns how many changed. */
  function applyRules(rows: Transaction[]): number {
    let changed = 0;
    for (const tx of rows) {
      if (tx.source === 'manual') continue;
      const name = tx.merchant ?? tx.description;
      const rule = [...state.rules]
        .filter((r) => matchesWords(name, r.pattern))
        .sort((a, b) => fold(b.pattern).length - fold(a.pattern).length)[0];
      if (rule && tx.category !== rule.category) {
        tx.category = rule.category;
        changed += 1;
      }
    }
    return changed;
  }

  // -- insights -----------------------------------------------------------------------------------

  function cardFees(): CardFee[] {
    const out: CardFee[] = [];
    for (const st of state.statements) {
      const sameCard = state.statements.filter((s) => cardKey(s) === cardKey(st)).flatMap((s) => s.transactions);
      for (const tx of st.transactions) {
        const text = fold(tx.description);
        if (tx.kind !== 'fee' || tx.direction !== 'debit' || !FEE_WORDS.some((w) => text.includes(w))) continue;
        out.push({
          transaction_id: tx.id,
          statement_id: st.id,
          date: tx.date,
          description: tx.description,
          amount: tx.amount,
          currency: tx.currency,
          bank: st.bank,
          product: st.product,
          card_last4: st.card_last4,
          statement_period_end: st.period_end,
          supplementary_card: false,
          refunded: sameCard.some((t) => t.kind === 'fee' && t.direction === 'credit' && t.amount === tx.amount),
        });
      }
    }
    return out.sort((a, b) => b.date.localeCompare(a.date));
  }

  function feePrompt(transactionId: string): CardFeePrompt {
    const fee = cardFees().find((f) => f.transaction_id === transactionId);
    if (!fee) throw new ApiError(404, 'card_fee_not_found', 'No annual card fee line with this id.', { id: transactionId });
    const route: CardFeePrompt["route"] = fee.amount < HAKEM_HEYETI_LIMIT ? "hakem_heyeti" : "consumer_court";
    const placeholders = ['[AD SOYAD]', '[TC KİMLİK NO]', '[ADRES]', '[TELEFON]'];
    return {
      fee,
      route,
      hakem_heyeti: { year: 2026, limit_below: HAKEM_HEYETI_LIMIT, currency: 'TRY', source: 'mock', apply: 'mock: e-Devlet üzerinden başvuru' },
      legal_basis: [
        { id: 'mock_basis_1', title: 'Örnek dayanak (mock)', summary: 'Mock modunda uydurma bir özet.', source: 'mock', verified: false },
      ],
      placeholders,
      prompt: `Aşağıdaki bilgilerle bankaya kart aidatı iade talebi ve ${route === 'hakem_heyeti' ? 'Tüketici Hakem Heyeti başvurusu' : 'tüketici mahkemesi dilekçesi'} yaz. Kişisel alanları ${placeholders.join(', ')} olarak bırak. Banka: ${fee.bank}, tarih: ${fee.date}, tutar: ${(fee.amount / 100).toFixed(2)} ${fee.currency}.`,
      note: 'kalan does not store the letter or any personal field; fill the placeholders in yourself.',
    };
  }

  function payoffFor(planId: string, month?: IsoMonth) {
    const sched = schedule(state.settings.months_ahead);
    const plan = sched.plans.find((p) => p.plan_id === planId);
    if (!plan) throw new ApiError(404, 'plan_not_found', 'No open installment plan with this id.', { id: planId });
    const payoffMonth = month ?? sched.months[0]!.month;
    if (!sched.months.some((m) => m.month === payoffMonth)) {
      throw new ApiError(422, 'month_outside_schedule', 'The payoff month must be inside the schedule window.', {
        start_month: sched.start_month,
        months: sched.months.length,
      });
    }
    const later = sched.months.filter((m) => m.month >= payoffMonth);
    const planItems = later.flatMap((m) => m.items.filter((i) => i.plan_id === planId).map((i) => ({ month: m.month, item: i })));
    const remainingCount = planItems.length;
    const remainingTotal = planItems.reduce((s, x) => s + x.item.amount, 0);
    const each = planItems[0]?.item.breakdown ?? null;
    const breakdown = each
      ? {
          principal: each.principal * remainingCount,
          interest: each.interest * remainingCount,
          bsmv: each.bsmv * remainingCount,
          kkdf: each.kkdf * remainingCount,
        }
      : null;
    return {
      plan_id: plan.plan_id,
      description: plan.description,
      kind: plan.kind,
      source: plan.source ?? 'statement',
      currency: sched.currency,
      payoff_month: payoffMonth,
      remaining_count: remainingCount,
      amount_each: plan.amount_each,
      remaining_total: remainingTotal,
      discount_rule: 'unknown' as const,
      note: 'kalan knows no bank payoff discount; ask the bank.',
      breakdown,
      remaining_principal: plan.kind === 'cash_advance' ? (breakdown?.principal ?? null) : remainingTotal,
      would_save_if_future_interest_dropped: breakdown ? breakdown.interest + breakdown.bsmv + breakdown.kkdf : null,
      schedule_effect: sched.months.map((m) => {
        const own = m.items.filter((i) => i.plan_id === planId).reduce((s, i) => s + i.amount, 0);
        if (m.month < payoffMonth) return { month: m.month, without: m.total, with: m.total };
        if (m.month === payoffMonth) return { month: m.month, without: m.total, with: m.total - own + remainingTotal };
        return { month: m.month, without: m.total, with: m.total - own };
      }),
    };
  }

  /** Spend that is neither an installment nor a subscription row. */
  function variableSpend(month: IsoMonth): number {
    const subs = new Set(subscriptions().map((s) => s.merchant));
    return monthTransactions(month)
      .txs.filter(countsAsSpend)
      .filter((t) => !t.installment && !(t.merchant && subs.has(t.merchant)))
      .reduce((s, t) => s + t.amount, 0);
  }

  function statementMonths(): IsoMonth[] {
    return [...new Set(sorted().map((s) => monthOf(s.period_end)))];
  }

  function forecastParts(month: IsoMonth, history: IsoMonth[], includeFixed: boolean, known = 0) {
    const sched = schedule(state.settings.months_ahead);
    const schedMonth = sched.months.find((m) => m.month === month);
    const latestMonth = history.at(-1);
    const subs = subscriptions()
      .filter((s) => s.months_seen.at(-1) === latestMonth)
      .map((s) => ({ merchant: s.merchant, amount: s.amount_last }));
    const installments = schedMonth?.total ?? 0;
    const subscriptionsTotal = subs.reduce((s, x) => s + x.amount, 0);
    const fixed = sched.fixed?.months.find((m) => m.month === month)?.total ?? 0;
    const basis = history.slice(-6);
    const variable = Math.max(median(basis.map(variableSpend)), known);
    return {
      parts: { installments, subscriptions: subscriptionsTotal, variable, fixed },
      total: installments + subscriptionsTotal + variable + (includeFixed ? fixed : 0),
      items: schedMonth?.items ?? [],
      subs,
      basis,
    };
  }

  function backtest(includeFixed: boolean, history: number, minHistory: number) {
    const months = statementMonths();
    const rows = months.flatMap((month, i) => {
      const earlier = months.slice(Math.max(0, i - history), i);
      if (earlier.length < minHistory) return [];
      const prev = state.statements.filter((s) => monthOf(s.period_end) === earlier.at(-1));
      const installments = prev
        .flatMap((s) => s.transactions)
        .filter((t) => t.installment && t.installment.remaining_count > 0)
        .reduce((s, t) => s + t.installment!.remaining_amount_each, 0);
      const variable = median(earlier.map(variableSpend));
      const subsTotal = subscriptions()
        .filter((s) => s.months_seen.includes(earlier.at(-1)!))
        .reduce((s, x) => s + x.amount_previous, 0);
      const fixed = includeFixed ? 0 : 0;
      const forecast = installments + variable + subsTotal + fixed;
      const actual = spendOf(monthTransactions(month).txs);
      return [{ month, forecast, actual, error: forecast - actual, parts: { installments, subscriptions: subsTotal, variable, fixed } }];
    });
    const errors = rows.map((r) => r.error);
    const withSpend = rows.filter((r) => r.actual > 0).map((r) => Math.abs(r.error) / r.actual);
    return {
      currency: state.settings.base_currency,
      months: rows,
      count: rows.length,
      mae: rows.length ? Math.round(errors.reduce((s, e) => s + Math.abs(e), 0) / rows.length) : null,
      mape: withSpend.length ? ratio(withSpend.reduce((s, e) => s + e, 0) / withSpend.length) : null,
      bias: rows.length ? Math.round(errors.reduce((s, e) => s + e, 0) / rows.length) : null,
      min_history: minHistory,
    };
  }

  // -- uploads ------------------------------------------------------------------------------------

  /** Simulated multipart upload: progress ticks, abort, then `finish` decides the outcome. */
  function simulateUpload<T>(opts: { onProgress?: (f: number) => void; signal?: AbortSignal }, finish: () => T): Promise<T> {
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
        try {
          resolve(clone(finish()));
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      };
      let timer = setTimeout(tick, uploadMs / steps);
      opts.signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new ApiError(0, 'aborted', 'Upload cancelled.'));
      });
    });
  }

  /**
   * Encrypted mock PDFs: the given password, else any remembered one (the bank is unknown until the
   * PDF opens, so the back end tries them all), else 422.
   */
  function openPdf(name: string, password: string | undefined) {
    if (!(name.includes('sifreli') || name.includes('encrypted'))) return;
    if (password !== undefined && password !== '') {
      if (password !== MOCK_PDF_PASSWORD) {
        throw new ApiError(422, 'pdf_password_wrong', 'The password does not open this PDF.', { hints: pdfPasswordHints });
      }
      return;
    }
    if (!state.remembered.size) {
      throw new ApiError(422, 'pdf_password_required', 'The PDF is encrypted. Send its password.', { hints: pdfPasswordHints });
    }
  }

  function uploadDetailed(file: File, opts: UploadOptions = {}): Promise<UploadResult> {
    const name = file.name.toLowerCase();
    if (file.size > 10 * 1024 * 1024) return fail(413, 'file_too_large', 'The file is larger than 10 MB.', { max_bytes: 10485760 });
    return simulateUpload(opts, () => {
      const target = pickStatement(name);
      openPdf(name, opts.password);
      if (name.includes('engel') || name.includes('blocked')) {
        throw new ApiError(422, 'save_blocked', 'The statement was read but failed the checks before saving.', { issues: blockedIssues });
      }
      if (target.parser_id === AI_FALLBACK_PARSER) {
        if (opts.aiFallback === false) {
          throw new ApiError(422, 'unknown_format', 'No supported bank statement format was recognised.', { ai_fallback: 'off' });
        }
        if (!state.selected) {
          throw new ApiError(422, 'unknown_format', 'No supported bank statement format was recognised.', { ai_fallback: 'no_provider' });
        }
        if (!fixtureProviders.find((p) => p.id === state.selected)?.available) {
          throw new ApiError(422, 'unknown_format', 'No supported bank statement format was recognised.', {
            ai_fallback: 'provider_unavailable',
          });
        }
      }
      if (findStatement(target.id)) {
        throw new ApiError(409, 'duplicate', 'This statement is already stored.', { statement_id: target.id });
      }
      const stored = clone(target);
      applyRules(stored.transactions);
      state.statements.push(stored);
      let passwordRemembered: boolean | null = null;
      if (opts.rememberPassword && opts.password) {
        passwordRemembered = stored.parser_id !== AI_FALLBACK_PARSER;
        if (passwordRemembered) state.remembered.add(stored.bank);
      }
      return { statement: stored, passwordRemembered };
    });
  }

  async function importFile(file: File, opts: Parameters<KalanApi['importFile']>[1] = {}) {
    if (file.size > 10 * 1024 * 1024) return fail(413, 'file_too_large', 'The file is larger than 10 MB.', { max_bytes: 10485760 });
    const mapping = opts.mapping ?? {};
    if (mapping.sign && mapping.sign !== 'negative_debit' && mapping.sign !== 'positive_debit') {
      return fail(422, 'invalid_mapping', 'The mapping is not valid.');
    }
    const name = file.name.toLowerCase();
    const format = opts.format ?? (name.endsWith('.ofx') || name.endsWith('.qfx') ? 'ofx' : name.endsWith('.qif') ? 'qif' : 'csv');
    const text = await file.text();
    return simulateUpload(opts, () => {
      const parsed =
        format === 'csv'
          ? parseCsv(text, mapping)
          : {
              // The mock does not read OFX/QIF; it returns two invented rows for any such file.
              rows: [
                { date: '2026-10-08', description: 'ORNEK ULASIM', amount: -12000, installment: null },
                { date: '2026-10-16', description: 'ORNEK KITABEVI 1/2', amount: -50000, installment: { index: 1, total: 2 } },
              ],
              detected: { delimiter: '', decimal: '.', date_format: 'YYYYMMDD', date_ambiguous: false, sign: 'negative_debit', columns: {} },
            };
      if (!parsed || !parsed.rows.length) {
        throw new ApiError(422, 'import_unreadable', 'The file could not be imported: no date, description and amount columns.');
      }
      const chargeSign = mapping.sign ?? parsed.detected.sign;
      const currency = mapping.currency ?? state.settings.base_currency;
      const existing = importRows();
      const id = `im_${state.nextId++}`;
      const fresh: Transaction[] = [];
      let skipped = 0;
      for (const row of parsed.rows) {
        const debit = chargeSign === 'negative_debit' ? row.amount < 0 : row.amount > 0;
        const amount = Math.abs(row.amount);
        if (existing.some((t) => t.date === row.date && t.description === row.description && t.amount === amount && t.currency === currency)) {
          skipped += 1;
          continue;
        }
        fresh.push({
          id: `tx_i_${state.nextId++}`,
          date: row.date,
          description: row.description,
          amount,
          currency,
          direction: debit ? 'debit' : 'credit',
          kind: row.installment ? 'installment' : debit ? 'purchase' : 'refund',
          installment: row.installment
            ? {
                remaining_count: row.installment.total - row.installment.index,
                remaining_amount_each: amount,
                is_last: row.installment.index === row.installment.total,
                plan_id: `pl_i_${state.nextId++}`,
                index: row.installment.index,
                total_count: row.installment.total,
                component: null,
              }
            : null,
          category: null,
          merchant: row.description.replace(/\s*\d{1,2}\s*\/\s*\d{1,2}\b.*$/, '').trim() || null,
          source: 'import',
          original_amount: null,
          original_currency: null,
          points: null,
          detail: null,
        });
      }
      applyRules(fresh);
      const summary: ImportSummary = {
        id,
        format,
        created_at: new Date(`${today()}T12:00:00Z`).toISOString(),
        currency,
        detected: parsed.detected,
        months: [...new Set(fresh.map((t) => monthOf(t.date)))].sort(),
        rows: parsed.rows.length,
        imported: fresh.length,
        skipped_duplicates: skipped,
      };
      state.imports.unshift({ summary, transactions: fresh });
      return { ...summary, transactions: fresh };
    });
  }

  // -- the adapter --------------------------------------------------------------------------------

  return {
    health: () => wait({ status: 'ok', version: '0.1.0-mock' }),
    getProviders: () => wait(providersResponse()),
    selectProvider: (id) => {
      const provider = fixtureProviders.find((p) => p.id === id);
      if (!provider) return fail(422, 'unknown_provider', `There is no provider called ${id}.`, { known: fixtureProviders.map((p) => p.id) });
      if (!provider.available) return fail(409, 'provider_unavailable', `${provider.name} is not available on this computer.`, { id });
      state.selected = id;
      return wait(providersResponse());
    },
    getSettings: () => wait(state.settings),
    putSettings: (settings) => {
      state.settings = clone(settings);
      return wait(state.settings);
    },

    uploadStatement: async (file, opts) => (await uploadDetailed(file, opts)).statement,
    uploadStatementDetailed: uploadDetailed,
    listStatements: () =>
      wait({
        items: sorted()
          .reverse()
          .map((s): StatementSummary => {
            const copy: Partial<Statement> = { ...s };
            for (const key of ['transactions', 'interest_rates', 'parser_id', 'credit_limit', 'next_period_end', 'next_due_date', 'printed_summary', 'page_count'] as const) {
              delete copy[key];
            }
            return copy as StatementSummary;
          }),
      }),
    getStatement: (id) => {
      const st = findStatement(id);
      return st ? wait(st) : fail(404, 'statement_not_found', 'No statement with this id.', { id });
    },
    deleteStatement: (id) => {
      if (!findStatement(id)) return fail(404, 'statement_not_found', 'No statement with this id.', { id });
      state.statements = state.statements.filter((s) => s.id !== id);
      state.analyses.delete(id);
      return wait(undefined);
    },
    createTemplateDraft: (id) =>
      later(() => {
        const st = findStatement(id);
        if (!st) throw new ApiError(404, 'statement_not_found', 'No statement with this id.', { id });
        if (st.parser_id !== AI_FALLBACK_PARSER) {
          throw new ApiError(409, 'no_statement_text', 'Only statements read by the AI fallback keep their text.');
        }
        const provider = requireProvider();
        return {
          provider,
          yaml: templateDraftYaml,
          valid: true,
          errors: [],
          detect: true,
          parse_error: null,
          reconciliation: { status: 'ok' as const, expected: st.statement_total, computed: st.statement_total, difference: 0 },
        };
      }),
    getPdfPasswords: () =>
      wait({
        keyring: true,
        items: MOCK_BANKS.map((bank) => ({
          bank,
          hint: pdfPasswordHints.find((h) => h.bank === bank)?.hint ?? null,
          remembered: state.remembered.has(bank),
        })),
      }),
    putPdfPassword: (bank, password) => {
      if (!MOCK_BANKS.includes(bank)) return fail(404, 'unknown_bank', 'No parser or template for this bank.', { known: MOCK_BANKS });
      if (!password) return fail(422, 'validation_error', 'The request is not valid.', { errors: [{ loc: ['body', 'password'], msg: 'too short' }] });
      state.remembered.add(bank);
      return wait(undefined);
    },
    deletePdfPassword: (bank) => {
      if (!state.remembered.delete(bank)) return fail(404, 'not_remembered', 'No password is remembered for this bank.');
      return wait(undefined);
    },

    getCategoryRules: () => wait({ items: state.rules, categories: CATEGORY_LIST }),
    createCategoryRule: (body) =>
      later(() => {
        if (!/[\p{L}\p{N}]/u.test(body.pattern)) throw new ApiError(422, 'invalid_pattern', 'The pattern has no letters or digits.');
        if (!CATEGORY_LIST.includes(body.category)) {
          throw new ApiError(422, 'validation_error', 'The request is not valid.', { errors: [{ loc: ['body', 'category'], msg: 'not allowed' }] });
        }
        const same = state.rules.find((r) => fold(r.pattern) === fold(body.pattern));
        if (same) throw new ApiError(409, 'duplicate_rule', 'A rule with this pattern exists.', { rule_id: same.id });
        const rule: CategoryRule = {
          id: `cr_${state.nextId++}`,
          pattern: body.pattern.trim(),
          category: body.category,
          created_at: new Date(`${today()}T12:00:00Z`).toISOString(),
        };
        state.rules.push(rule);
        const applied = body.apply === false ? 0 : applyRules([...state.statements.flatMap((s) => s.transactions), ...importRows()]);
        return { rule, applied };
      }),
    deleteCategoryRule: (id) => {
      if (!state.rules.some((r) => r.id === id)) return fail(404, 'not_found', 'No such category rule.');
      state.rules = state.rules.filter((r) => r.id !== id);
      return wait(undefined);
    },
    diagnose: (file, opts = {}) => {
      const name = file.name.toLowerCase();
      if (file.size > 10 * 1024 * 1024) return fail(413, 'file_too_large', 'The file is larger than 10 MB.', { max_bytes: 10485760 });
      if (!name.endsWith('.pdf')) return fail(415, 'not_pdf', 'The file is not a PDF.');
      return simulateUpload(opts, () => {
        openPdf(name, opts.password);
        const report = clone(diagnosisFixture);
        const text = [
          `kalan ${report.kalan_version}, ${report.page_count} pages, ${report.line_count} lines`,
          `numbers: ${Object.entries(report.number_styles).map(([k, v]) => `${k}=${v}`).join(' ')}`,
          ...report.shapes.map((s) => `p${s.page} ${s.shape}${s.repeat > 1 ? ` x${s.repeat}` : ''}`),
        ].join('\n');
        return { report, text };
      });
    },

    importFile: (file, opts) => importFile(file, opts),
    listImports: () => wait({ items: state.imports.map((b) => b.summary) }),
    deleteImport: (id) => {
      if (!state.imports.some((b) => b.summary.id === id)) return fail(404, 'import_not_found', 'No import with this id.', { id });
      state.imports = state.imports.filter((b) => b.summary.id !== id);
      return wait(undefined);
    },

    createTransaction: (body: NewTransaction) => {
      if (!body.description.trim() || body.amount <= 0) {
        return fail(422, 'validation_error', 'Description and a positive amount are required.', {
          errors: [{ loc: ['body', 'amount'], msg: 'must be positive' }],
        });
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
          index: null,
          total_count: body.installment.total_count,
          component: null,
        };
      }
      const tx: Transaction = {
        id,
        date: body.date,
        description: body.description,
        amount: body.amount,
        currency: body.currency,
        direction: body.direction,
        kind: installment ? 'installment' : body.direction === 'debit' ? 'purchase' : 'refund',
        installment,
        category: null,
        merchant: null,
        source: 'manual',
        original_amount: null,
        original_currency: null,
        points: null,
        detail: null,
      };
      state.manualTransactions.push(tx);
      return wait(tx);
    },
    // `month` is the statement month: a statement row belongs to the month of its statement's period_end,
    // a manual or imported row to the month of its own date (contract: GET /transactions).
    listTransactions: (filter = {}) =>
      wait({
        items: [
          ...state.statements.flatMap((s) => s.transactions.map((t) => ({ t, month: monthOf(s.period_end) }))),
          ...looseRows().map((t) => ({ t, month: monthOf(t.date) })),
        ]
          .filter(({ t, month }) => (!filter.month || month === filter.month) && (!filter.source || t.source === filter.source))
          .map(({ t }) => t)
          .sort((a, b) => a.date.localeCompare(b.date)),
      }),
    deleteTransaction: (id) => {
      const tx = state.manualTransactions.find((t) => t.id === id);
      if (!tx) {
        return allRows().some((t) => t.id === id)
          ? fail(409, 'not_manual', 'Only manual transactions can be deleted.')
          : fail(404, 'transaction_not_found', 'No transaction with this id.', { id });
      }
      state.manualTransactions = state.manualTransactions.filter((t) => t.id !== id);
      if (tx.installment) state.manualPlans = state.manualPlans.filter((p) => p.plan_id !== tx.installment!.plan_id);
      return wait(undefined);
    },

    createFixedCost: (body) =>
      later(() => {
        if (body.end && body.end < body.start) throw new ApiError(422, 'invalid_period', 'The end month is before the start month.');
        const cost: FixedCost = {
          id: `fc_${state.nextId++}`,
          name: body.name,
          amount: body.amount,
          currency: body.currency ?? state.settings.base_currency,
          day: body.day,
          start: body.start,
          end: body.end ?? null,
          category: body.category ?? null,
        };
        state.fixedCosts.push(cost);
        return cost;
      }),
    listFixedCosts: () => wait({ items: state.fixedCosts }),
    deleteFixedCost: (id) => {
      if (!state.fixedCosts.some((c) => c.id === id)) return fail(404, 'fixed_cost_not_found', 'No such fixed cost.');
      state.fixedCosts = state.fixedCosts.filter((c) => c.id !== id);
      return wait(undefined);
    },

    getSchedule: (months) => wait(schedule(months)),
    getMonthlySummary: (month) => wait(summary(month)),
    getSubscriptions: () => wait({ items: subscriptions() }),
    simulateInstallment: (body) =>
      later(() => {
        if (!(body.amount > 0) || !(body.count >= 1)) {
          throw new ApiError(422, 'validation_error', 'The request is not valid.', { errors: [{ loc: ['body'], msg: 'amount and count must be positive' }] });
        }
        const months = body.months ?? state.settings.months_ahead;
        return simulate(body, schedule(Math.max(months, 1)), months);
      }),
    getAlerts: () => wait({ items: alerts() }),

    analyzeStatement: (id) => {
      const st = findStatement(id);
      if (!st) return fail(404, 'statement_not_found', 'No statement with this id.', { id });
      if (!state.selected) return fail(409, 'no_provider', 'Choose an AI provider first.');
      const jobId = `job_${state.nextId++}`;
      const provider = state.selected;
      st.analysis_status = 'pending';
      state.jobs.set(jobId, { status: 'pending', error: null });
      setTimeout(() => {
        const texts = analysisTexts[id];
        const commentary = texts
          ? clone(texts[state.settings.locale === 'tr' ? 'tr' : 'en'])
          : { locale: state.settings.locale, summary: '', watch_items: [] };
        state.analyses.set(id, { categories_applied: true, commentary, provider, created_at: new Date().toISOString() });
        st.analysis_status = 'done';
        state.jobs.set(jobId, { status: 'done', error: null });
      }, analysisMs);
      return wait({ job_id: jobId, status: 'pending' as const });
    },
    getJob: (jobId) => {
      const job = state.jobs.get(jobId);
      return job ? wait(job) : fail(404, 'job_not_found', 'No job with this id.', { id: jobId });
    },
    getAnalysis: (id) => {
      if (!findStatement(id)) return fail(404, 'statement_not_found', 'No statement with this id.', { id });
      const analysis = state.analyses.get(id);
      return analysis ? wait(analysis) : fail(404, 'analysis_not_found', 'This statement has not been analysed yet.');
    },

    getInsightRules: () => wait({ rules: insightRulesFixture.rules, overrides: state.overrides }),
    putInsightRules: (body) =>
      later(() => {
        const rate = /^\d{1,2}(?:\.\d{1,4})?$/;
        const share = /^0(?:\.\d{1,4})?$|^1(?:\.0{1,4})?$/;
        const next: RuleOverrides = { contractual_monthly: null, late_monthly: null, bsmv: null, kkdf: null, minimum_ratio: null };
        for (const [key, value] of Object.entries(body) as [keyof RuleOverrides, string | null | undefined][]) {
          if (!(key in next)) {
            throw new ApiError(422, 'validation_error', 'The request is not valid.', { errors: [{ loc: ['body', key], msg: 'extra field' }] });
          }
          if (value === null || value === undefined) continue;
          const pattern = key === 'contractual_monthly' || key === 'late_monthly' ? rate : share;
          if (!pattern.test(value)) {
            throw new ApiError(422, 'validation_error', 'The request is not valid.', { errors: [{ loc: ['body', key], msg: 'malformed' }] });
          }
          next[key] = value;
        }
        state.overrides = next;
        return { rules: insightRulesFixture.rules, overrides: state.overrides };
      }),
    getMinimumPayment: (query = {}) =>
      later(() => {
        const st = query.statement_id ? findStatement(query.statement_id) : sorted().at(-1);
        if (!st) {
          if (query.statement_id) throw new ApiError(404, 'statement_not_found', 'No statement with this id.', { id: query.statement_id });
          throw new ApiError(409, 'no_statements', 'Upload a statement first.');
        }
        const o = state.overrides;
        const printed = st.interest_rates.purchase_monthly;
        const monthly = o.contractual_monthly ?? printed ?? '3.25';
        const monthlySource = o.contractual_monthly ? 'override' : printed ? 'statement' : 'rules';
        const bsmv = o.bsmv ?? '0.15';
        const kkdf = o.kkdf ?? '0.15';
        const minimumRatio = o.minimum_ratio ?? '0.20';
        const charges = query.include_installments
          ? Object.fromEntries(schedule(60).months.map((m) => [m.month, m.total]))
          : null;
        const run = minimumCycles({ statement: st, monthly: Number(monthly), bsmv: Number(bsmv), kkdf: Number(kkdf), minimumRatio: Number(minimumRatio), charges });
        const cost = run.totals.interest + run.totals.bsmv + run.totals.kkdf;
        const paidOff = run.balanceLeft <= 0;
        return {
          statement_id: st.id,
          currency: st.currency,
          start_balance: st.statement_total,
          minimum_only: {
            cycles: run.cycles.length,
            paid_off: paidOff,
            last_payment_cut_off: run.lastCutOff,
            total_paid: run.totals.paid,
            interest: run.totals.interest,
            bsmv: run.totals.bsmv,
            kkdf: run.totals.kkdf,
            cost,
            balance_left: Math.max(0, run.balanceLeft),
          },
          pay_in_full: { total_paid: st.statement_total, cost: 0 },
          extra_cost: cost,
          rates: {
            contractual_monthly: [{ from_cycle: 1, monthly, source: monthlySource, detail: null }],
            bsmv: { value: bsmv, source: o.bsmv ? 'override' : 'rules', detail: null },
            kkdf: { value: kkdf, source: o.kkdf ? 'override' : 'rules', detail: null },
            minimum_ratio: { value: minimumRatio, source: o.minimum_ratio ? 'override' : 'rules', detail: 'mock: one ratio for every limit' },
          },
          assumptions: [
            { key: 'minimum_paid_on_time', text: 'Every minimum payment is made on its due date.' },
            { key: 'no_new_spend', text: query.include_installments ? 'Only scheduled installments are added.' : 'No new spend is added.' },
          ],
          cycles: query.cycles !== undefined ? run.cycles.slice(0, query.cycles) : run.cycles,
        } as const;
      }),
    listCardFees: () => later(() => ({ items: cardFees() })),
    getCardFeePrompt: (id) => later(() => feePrompt(id)),
    draftCardFeeLetter: (id) =>
      later(() => {
        const built = feePrompt(id);
        const provider = requireProvider();
        const kept = built.placeholders.slice(0, 3);
        return {
          provider,
          text: `Sayın ${built.fee.bank} yetkilisi,\n\n${built.fee.date} tarihli ${(built.fee.amount / 100).toFixed(2)} ${built.fee.currency} kart aidatının iadesini talep ederim.\n\n${kept.join('\n')}\n\n(mock taslak)`,
          route: built.route,
          placeholders_kept: kept,
          placeholders_missing: built.placeholders.filter((p) => !kept.includes(p)),
        };
      }),
    getWhichCard: (date) =>
      later(() => {
        const on = date ?? today();
        const cards = latestPerCard()
          .map((st) => cardOption(st, on))
          .sort((a, b) => b.interest_free_days - a.interest_free_days);
        const assumptions = [{ key: 'same_day_each_month', text: 'Without a printed next cut-off, the cut-off is the same day each month.' }];
        if (cards.some((c) => c.stale)) assumptions.push({ key: 'stale', text: 'Some cards have no statement in the last 45 days.' });
        return { date: on, best: cards[0] ?? null, cards, assumptions };
      }),
    getShareCard: (query = {}) =>
      later(() => {
        const locale = query.locale ?? 'tr';
        const amounts = query.amounts ?? false;
        const sched = schedule(12);
        const peak = Math.max(0, ...sched.months.map((m) => m.total));
        const months = sched.months.map((m) => ({
          month: m.month,
          share: ratio(peak ? m.total / peak : 0),
          ...(amounts ? { total: m.total } : {}),
        }));
        const sentence = shareSentence(sched, locale, amounts);
        return { locale, show_amounts: amounts, sentence, months, ...(amounts ? { currency: sched.currency } : {}), svg: shareSvg(months, sentence) };
      }),
    getShareCardSvg: (query = {}) =>
      later(() => {
        const sched = schedule(12);
        const peak = Math.max(0, ...sched.months.map((m) => m.total));
        const months = sched.months.map((m) => ({ month: m.month, share: ratio(peak ? m.total / peak : 0) }));
        return shareSvg(months, shareSentence(sched, query.locale ?? 'tr', query.amounts ?? false));
      }),
    getForecast: (includeFixed = true) =>
      later(() => {
        const latest = sorted().at(-1);
        const now = today();
        const bt = backtest(includeFixed, 6, 2);
        const summaryOnly = { currency: bt.currency, count: bt.count, mae: bt.mae, mape: bt.mape, bias: bt.bias, min_history: bt.min_history };
        if (!latest) {
          return { open_period: { from: null, to: now, transactions: [], debit_total: 0, credit_total: 0 }, forecast: null, backtest: summaryOnly };
        }
        const open = looseRows().filter((t) => t.date > latest.period_end).sort((a, b) => a.date.localeCompare(b.date));
        const debit = open.filter((t) => t.direction === 'debit').reduce((s, t) => s + t.amount, 0);
        const month = addMonths(monthOf(latest.period_end), 1);
        const f = forecastParts(month, statementMonths(), includeFixed, debit);
        return {
          open_period: {
            from: addDays(latest.period_end, 1),
            to: now,
            transactions: open,
            debit_total: debit,
            credit_total: open.filter((t) => t.direction === 'credit').reduce((s, t) => s + t.amount, 0),
          },
          forecast: {
            month,
            currency: state.settings.base_currency,
            total: f.total,
            parts: f.parts,
            include_fixed: includeFixed,
            variable_basis: { months: f.basis, median: median(f.basis.map(variableSpend)), known_in_month: debit },
            installment_items: f.items,
            subscriptions: f.subs,
          },
          backtest: summaryOnly,
        };
      }),
    getForecastBacktest: (query = {}) =>
      later(() => backtest(query.include_fixed ?? true, query.history ?? 6, query.min_history ?? 2)),
    getEarlyPayoffOverview: () =>
      later(() => {
        const sched = schedule(state.settings.months_ahead);
        const closed = state.statements.flatMap((st) =>
          st.transactions
            .filter((t) => t.installment && (t.installment.component === 'early_payoff' || (t.installment.is_last && t.installment.total_count !== null && t.installment.index !== null && t.installment.index < t.installment.total_count)))
            .map((t) => ({
              plan_id: t.installment!.plan_id,
              statement_id: st.id,
              month: monthOf(st.period_end),
              transaction_id: t.id,
              index: t.installment!.index,
              total_count: t.installment!.total_count,
            })),
        );
        return {
          currency: sched.currency,
          start_month: sched.start_month ?? sched.months[0]!.month,
          plans: sched.plans.map((p) => payoffFor(p.plan_id)),
          closed_early: closed,
        };
      }),
    getEarlyPayoff: (planId, month) => later(() => payoffFor(planId, month)),
    listCancelledSubscriptions: () => wait({ items: state.cancelled }),
    addCancelledSubscription: (body) =>
      later(() => {
        state.cancelled = state.cancelled.filter((c) => fold(c.merchant) !== fold(body.merchant));
        state.cancelled.push({ merchant: body.merchant.trim(), cancelled_on: body.cancelled_on });
        return { items: state.cancelled };
      }),
    deleteCancelledSubscription: (merchant) => {
      if (!state.cancelled.some((c) => fold(c.merchant) === fold(merchant))) {
        return fail(404, 'cancellation_not_found', 'No cancelled subscription with this merchant.');
      }
      state.cancelled = state.cancelled.filter((c) => fold(c.merchant) !== fold(merchant));
      return wait(undefined);
    },
    getFixedCostMatches: () => later(() => matchFixedCosts(state.fixedCosts, allRows())),
    exportData: (query) =>
      later(() => {
        const what = query.what ?? 'transactions';
        if (what === 'plans' && query.format !== 'csv') {
          throw new ApiError(422, 'plans_csv_only', 'Plans export on their own as CSV; hledger and beancount include them.');
        }
        const currency = query.currency ?? state.settings.base_currency;
        const rows = [
          ...state.statements.flatMap((st) =>
            st.transactions.map((tx) => ({ tx, account: `liabilities:card:${st.bank}:${st.card_last4}` })),
          ),
          ...looseRows().map((tx) => ({ tx, account: `liabilities:card:${tx.source}` })),
        ];
        const { text, skipped } = exportText(query.format, what, rows, schedule(60).plans, currency);
        const ext = { hledger: 'journal', beancount: 'beancount', ofx: 'ofx', csv: 'csv' }[query.format];
        return { text, filename: `kalan-${what}.${ext}`, contentType: EXPORT_MEDIA[query.format], skippedRows: skipped };
      }),
  };
}
