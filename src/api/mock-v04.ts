// v0.4.0 layer of the mock (task 6): cards and their labels, closed plans, regular payments split into
// subscriptions and bills, frequent places, this month's payments per card, suggestions and the AI batch.
// It wraps the v0.3 adapter and reads its state, so the derived screens stay consistent. Invented data only.
import { bankName } from '../lib/banks';
import { addMonths, monthOf, monthsBetween } from '../lib/month';
import { addDays, countsAsSpend, dateIn, daysBetween, fold, median } from './mock-calc';
import {
  ApiError,
  type Alert,
  type AnalysisRun,
  type CardInfo,
  type CardParts,
  type FixedCost,
  type ForecastCard,
  type FrequentPlace,
  type IsoDate,
  type IsoMonth,
  type KalanApi,
  type ProviderId,
  type Schedule,
  type SchedulePlan,
  type Settings,
  type Statement,
  type StatementSummary,
  type Subscription,
  type Suggestion,
  type Transaction,
} from './types';

/** The v0.3 adapter: every route except the ones this layer adds. */
export type V03Api = Omit<
  KalanApi,
  | 'startAnalysisAll'
  | 'getAnalysisAll'
  | 'listCards'
  | 'renameCard'
  | 'closePlan'
  | 'reopenPlan'
  | 'setSubscriptionExpected'
  | 'clearSubscriptionExpected'
  | 'getSuggestions'
  | 'getFrequentPlaces'
>;

export interface MockCore {
  statements: Statement[];
  manualTransactions: Transaction[];
  imports: { transactions: Transaction[] }[];
  fixedCosts: FixedCost[];
  settings: Settings;
  selected: ProviderId | null;
}

export interface MockHooks {
  state: MockCore;
  today: () => IsoDate;
  /** What the v0.3 single-statement analysis does when it finishes (commentary, status). */
  finishAnalysis: (statementId: string, provider: ProviderId) => void;
  providerAvailable: (id: ProviderId) => boolean;
  stepMs: number;
  latency: number;
}

const BILL_CATEGORIES = new Set(['utilities', 'telecom']);
const FREQUENT_SUGGEST = new Set(['dining', 'entertainment', 'shopping', 'groceries']);
/** Words the mock "model" uses to sort uncategorised rows. */
const MODEL_WORDS: [string, string][] = [
  ['kirtasiye', 'education'],
  ['eczane', 'health'],
  ['market', 'groceries'],
  ['yemek', 'dining'],
  ['kafe', 'dining'],
  ['giyim', 'clothing'],
];

/** FNV-1a, ten hex digits: stable ids like the back end's hashes. */
function hash10(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).slice(0, 10);
}

const clone = <T>(value: T): T => structuredClone(value);

export function extendMock(base: V03Api, hooks: MockHooks): KalanApi {
  const { state } = hooks;
  const names = new Map<string, string>();
  const closedByUser = new Map<string, IsoDate>();
  const expected = new Map<string, { amount: number; since: IsoDate }>();
  const modelRows = new Set<string>();
  let batch: AnalysisRun | null = null;
  let aiSuggestions: Suggestion[] = [];
  let aiCreated: string | null = null;
  let aiProvider: ProviderId | null = null;
  let batchQueue: string[] = [];

  const wait = <T>(value: T, ms = hooks.latency): Promise<T> => new Promise((r) => setTimeout(() => r(clone(value)), ms));
  const reject = (status: number, code: string, message: string) =>
    new Promise<never>((_, rej) => setTimeout(() => rej(new ApiError(status, code, message)), hooks.latency));
  const tr = () => state.settings.locale === 'tr';
  const sorted = () => [...state.statements].sort((a, b) => a.period_end.localeCompare(b.period_end));

  // -- cards ----------------------------------------------------------------------------------------

  const cardIdOf = (bank: string, last4: string) => `cd_${hash10(`${bank}:${last4}`)}`;
  const stCard = (st: Pick<Statement, 'bank' | 'card_last4'>) => cardIdOf(st.bank, st.card_last4);

  function labelOf(bank: string, product: string | null, last4: string, name: string | undefined) {
    if (name) return `${name} ··${last4}`;
    const short = bankName(bank);
    const prod = product && !fold(product).includes(fold(short)) ? ` ${product}` : '';
    return `${short}${prod} ··${last4}`;
  }

  function cards(): CardInfo[] {
    const byId = new Map<string, Statement[]>();
    for (const st of sorted()) byId.set(stCard(st), [...(byId.get(stCard(st)) ?? []), st]);
    return [...byId.entries()]
      .map(([id, list]) => {
        const first = list[0]!;
        const last = list.at(-1)!;
        return {
          id,
          bank: first.bank,
          bank_name: bankName(first.bank),
          product: first.product,
          card_last4: first.card_last4,
          name: names.get(id) ?? null,
          label: labelOf(first.bank, first.product, first.card_last4, names.get(id)),
          statement_count: list.length,
          first_month: monthOf(first.period_end),
          last_month: monthOf(last.period_end),
          latest_statement_id: last.id,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  const labelFor = (cardId: string | null | undefined) => (cardId ? (cards().find((c) => c.id === cardId)?.label ?? null) : null);
  const cardOfStatement = (id: string) => {
    const st = state.statements.find((s) => s.id === id);
    return st ? stCard(st) : null;
  };
  /** Statement row id -> its card. */
  function rowCards(): Map<string, string> {
    const map = new Map<string, string>();
    for (const st of state.statements) for (const tx of st.transactions) map.set(tx.id, stCard(st));
    return map;
  }

  function decorateTx(tx: Transaction, cardId: string | null): Transaction {
    return {
      ...tx,
      card_id: cardId,
      card_label: labelFor(cardId),
      category_source: tx.category ? (modelRows.has(tx.id) ? 'model' : tx.source === 'manual' ? 'user' : 'rule') : null,
      merchant_unreadable: false,
    };
  }

  function decorateStatement<T extends StatementSummary>(st: T): T {
    const cardId = stCard(st);
    const out = { ...st, card_id: cardId, card_label: labelFor(cardId) };
    if ('transactions' in out && Array.isArray((out as unknown as Statement).transactions)) {
      (out as unknown as Statement).transactions = (out as unknown as Statement).transactions.map((t) => decorateTx(t, cardId));
    }
    return out;
  }

  // -- plans ----------------------------------------------------------------------------------------

  /** Plan id -> where it was last seen: card, statement month, installments left. */
  function planSightings() {
    const seen = new Map<string, { card: string; month: IsoMonth; left: number }>();
    for (const st of sorted()) {
      for (const tx of st.transactions) {
        if (tx.installment) seen.set(tx.installment.plan_id, { card: stCard(st), month: monthOf(st.period_end), left: tx.installment.remaining_count });
      }
    }
    return seen;
  }

  /** Plans a newer statement of the same card shows as gone: plan id -> that statement. */
  function closedByStatement(): Map<string, Statement> {
    const out = new Map<string, Statement>();
    for (const [planId, s] of planSightings()) {
      if (s.left <= 0) continue;
      const newer = sorted().find((st) => {
        if (stCard(st) !== s.card) return false;
        const gap = monthsBetween(s.month, monthOf(st.period_end));
        return gap >= 1 && gap <= s.left && !st.transactions.some((t) => t.installment?.plan_id === planId);
      });
      if (newer) out.set(planId, newer);
    }
    return out;
  }

  function decorateSchedule(raw: Schedule): Schedule {
    const sightings = planSightings();
    const byStatement = closedByStatement();
    const isClosed = (id: string) => closedByUser.has(id) || byStatement.has(id);
    const counts = new Map<string, number>();
    for (const m of raw.months) for (const it of m.items) counts.set(it.plan_id, it.count);
    const cardOf = (id: string) => sightings.get(id)?.card ?? null;

    const months = raw.months.map((m) => {
      const items = m.items
        .filter((it) => !isClosed(it.plan_id))
        .map((it) => ({ ...it, card_id: cardOf(it.plan_id), card_label: labelFor(cardOf(it.plan_id)) }));
      return { ...m, items, total: items.reduce((s, it) => s + it.amount, 0) };
    });
    const extra = (p: SchedulePlan): SchedulePlan => {
      const total = counts.get(p.plan_id) ?? null;
      return {
        ...p,
        card_id: cardOf(p.plan_id),
        card_label: labelFor(cardOf(p.plan_id)),
        total_count: total,
        paid_count: total === null ? null : total - p.remaining_count,
      };
    };
    const open = raw.plans
      .filter((p) => !isClosed(p.plan_id))
      .map((p): SchedulePlan => {
        const next = months.find((m) => m.items.some((it) => it.plan_id === p.plan_id));
        return { ...extra(p), next_month: next?.month ?? null, next_amount: p.amount_each, closed: null, closed_at: null, statement_id: null };
      });
    const closed = raw.plans
      .filter((p) => isClosed(p.plan_id))
      .map((p): SchedulePlan => {
        const st = byStatement.get(p.plan_id);
        const seen = sightings.get(p.plan_id);
        return {
          ...extra(p),
          ends: seen?.month ?? p.ends,
          next_month: null,
          next_amount: 0,
          closed: st && !closedByUser.has(p.plan_id) ? 'statement' : 'user',
          closed_at: closedByUser.get(p.plan_id) ?? (st ? st.period_end : null),
          statement_id: st && !closedByUser.has(p.plan_id) ? st.id : null,
        };
      });
    const ends = open.map((p) => p.ends).sort();
    return {
      ...raw,
      months,
      plans: [...open, ...closed],
      summary: { total_remaining: open.reduce((s, p) => s + p.total_remaining, 0), plan_count: open.length, last_month: ends.at(-1) ?? null },
    };
  }

  // -- regular payments -------------------------------------------------------------------------------

  const subId = (merchant: string, currency: string) => `sb_${hash10(`${fold(merchant)}:${currency}`)}`;

  /** Merchant -> month -> { amount, card, date } for statement rows of one category set. */
  function chargesBy(test: (tx: Transaction) => boolean) {
    const out = new Map<string, Map<IsoMonth, { amount: number; card: string; date: IsoDate }>>();
    for (const st of sorted()) {
      for (const tx of st.transactions) {
        if (!tx.merchant || !countsAsSpend(tx) || tx.installment || !test(tx)) continue;
        const months = out.get(tx.merchant) ?? new Map<IsoMonth, { amount: number; card: string; date: IsoDate }>();
        const prev = months.get(monthOf(st.period_end));
        months.set(monthOf(st.period_end), { amount: (prev?.amount ?? 0) + tx.amount, card: stCard(st), date: tx.date });
        out.set(tx.merchant, months);
      }
    }
    return out;
  }

  function bills(): Subscription[] {
    const items: Subscription[] = [];
    for (const [merchant, months] of chargesBy((tx) => BILL_CATEGORIES.has(tx.category ?? ''))) {
      const seen = [...months.keys()].sort();
      const consecutive = seen.some((m, i) => i > 0 && monthsBetween(seen[i - 1]!, m) === 1);
      if (!consecutive) continue;
      const last = months.get(seen.at(-1)!)!;
      const previous = seen.length > 1 ? months.get(seen.at(-2)!)!.amount : null;
      items.push({
        merchant,
        amount_last: last.amount,
        amount_previous: previous,
        currency: 'TRY',
        months_seen: seen,
        price_change: null,
        kind: 'bill',
        category: 'utilities',
        card_id: last.card,
        last_date: last.date,
      });
    }
    return items;
  }

  function decorateSubscriptions(raw: Subscription[]): Subscription[] {
    const lastCard = chargesBy((tx) => tx.category === 'subscriptions');
    const all = [
      ...raw.map((s): Subscription => {
        const months = lastCard.get(s.merchant);
        const last = months?.get(s.months_seen.at(-1)!);
        return { ...s, kind: 'subscription', category: 'subscriptions', card_id: last?.card ?? null, last_date: last?.date };
      }),
      ...bills(),
    ];
    return all.map((s) => {
      const id = subId(s.merchant, s.currency);
      const exp = expected.get(id);
      return {
        ...s,
        id,
        expected_amount: exp?.amount ?? null,
        expected_since: exp?.since ?? null,
        monthly_amount: exp?.amount ?? s.amount_last,
        card_label: labelFor(s.card_id),
      };
    });
  }

  async function subscriptionsNow() {
    const raw = await base.getSubscriptions();
    return decorateSubscriptions(raw.items);
  }

  function totalsOf(items: Subscription[]) {
    const sum = (kind: string) => items.filter((s) => s.kind === kind).reduce((n, s) => n + (s.monthly_amount ?? s.amount_last), 0);
    return [{ currency: 'TRY', subscription: sum('subscription'), bill: sum('bill') }];
  }

  // -- frequent places --------------------------------------------------------------------------------

  function frequentPlaces(subs: Subscription[], months = 6) {
    const regular = new Set(subs.map((s) => fold(s.merchant)));
    const rows = [
      ...state.statements.flatMap((st) => st.transactions.map((t) => ({ t, month: monthOf(st.period_end), card: stCard(st) }))),
    ].filter(({ t }) => t.kind === 'purchase' && t.direction === 'debit' && t.merchant && t.currency === 'TRY' && !regular.has(fold(t.merchant)));
    const window = [...new Set(rows.map((r) => r.month))].sort().slice(-months);
    const byPlace = new Map<string, typeof rows>();
    for (const r of rows.filter((r) => window.includes(r.month))) byPlace.set(r.t.merchant!, [...(byPlace.get(r.t.merchant!) ?? []), r]);
    const items: FrequentPlace[] = [];
    for (const [merchant, list] of byPlace) {
      const monthsSeen = new Set(list.map((r) => r.month)).size;
      if (monthsSeen < 2 || list.length < 3) continue;
      const total = list.reduce((s, r) => s + r.t.amount, 0);
      items.push({
        merchant,
        kind: 'frequent_place',
        category: list[0]!.t.category,
        months_seen: monthsSeen,
        visits: list.length,
        total,
        monthly_average: Math.round(total / Math.max(1, window.length)),
        last_date: list.map((r) => r.t.date).sort().at(-1)!,
        card_ids: [...new Set(list.map((r) => r.card))],
      });
    }
    return { currency: 'TRY', window: { months: window, count: window.length }, items: items.sort((a, b) => b.monthly_average - a.monthly_average) };
  }

  // -- this month's payments per card ---------------------------------------------------------------

  function forecastCards(schedule: Schedule, subs: Subscription[]): ForecastCard[] {
    const now = hooks.today();
    const out: ForecastCard[] = [];
    for (const card of cards()) {
      const list = sorted().filter((s) => stCard(s) === card.id);
      const st = list.at(-1)!;
      const month = addMonths(monthOf(st.period_end), 1);
      const day = Number(st.period_end.slice(8, 10));
      const cutOff = st.next_period_end ?? dateIn(month, day);
      const due = st.next_due_date ?? addDays(cutOff, daysBetween(st.period_end, st.due_date));
      const installments = (schedule.months.find((m) => m.month === month)?.items ?? []).filter((it) => it.card_id === card.id);
      const cardSubs = subs.filter((s) => s.card_id === card.id && s.months_seen.at(-1) === monthOf(st.period_end));
      const regular = new Set(subs.map((s) => s.merchant));
      const earlier = list.slice(-6).map((s) =>
        s.transactions.filter((t) => countsAsSpend(t) && !t.installment && !(t.merchant && regular.has(t.merchant))).reduce((n, t) => n + t.amount, 0),
      );
      const parts: CardParts = {
        installments: installments.reduce((n, it) => n + it.amount, 0),
        subscriptions: cardSubs.reduce((n, s) => n + (s.monthly_amount ?? s.amount_last), 0),
        other: median(earlier),
      };
      const total = parts.installments + parts.subscriptions + parts.other;
      const count = earlier.length;
      const next = {
        month,
        cut_off: cutOff,
        due_date: due,
        dates: st.next_period_end ? ('printed' as const) : ('estimated' as const),
        total,
        parts,
        installment_items: installments,
        subscriptions: cardSubs.map((s) => ({ id: s.id!, merchant: s.merchant, amount: s.monthly_amount ?? s.amount_last })),
        note: tr()
          ? `Diğer harcamalar için bu kartla son ${count} ayda genelde harcadığın tutarı aldım.`
          : `For other spending I used what you usually spent with this card over the last ${count} months.`,
        note_key: count ? 'forecast.note.usual' : 'forecast.note.no_history',
        note_params: { months: count },
      };
      const actual = st.due_date >= now && st.statement_total > 0;
      out.push({
        card_id: card.id,
        card_label: card.label,
        bank: card.bank,
        card_last4: card.card_last4,
        due_date: actual ? st.due_date : due,
        amount: actual ? st.statement_total : total,
        estimated: !actual,
        statement_id: actual ? st.id : null,
        minimum_payment: actual ? st.minimum_payment : null,
        days_left: daysBetween(now, actual ? st.due_date : due),
        parts: actual ? null : parts,
        next_statement: next,
      });
    }
    return out.sort((a, b) => a.due_date.localeCompare(b.due_date));
  }

  // -- alerts ---------------------------------------------------------------------------------------

  function monthText(m: IsoMonth) {
    return new Intl.DateTimeFormat(tr() ? 'tr-TR' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${m}-01T00:00:00Z`));
  }

  function decorateAlerts(raw: Alert[], schedule: Schedule, subs: Subscription[]): Alert[] {
    const closed = new Set(schedule.plans.filter((p) => p.closed).map((p) => p.plan_id));
    const withExpected = new Set(subs.filter((s) => s.expected_amount).map((s) => fold(s.merchant)));
    const sightings = planSightings();
    const out: Alert[] = [];
    for (const a of raw) {
      if (a.kind === 'installment_ending' && a.refs.plan_ids.some((id) => closed.has(id))) continue;
      if (a.kind === 'subscription_price_rise' && withExpected.has(fold(String(a.params.merchant ?? '')))) continue;
      if (a.kind === 'missing_statement') continue;
      const cardId =
        (a.refs.statement_ids[0] ? cardOfStatement(a.refs.statement_ids[0]) : null) ??
        (a.refs.plan_ids[0] ? (sightings.get(a.refs.plan_ids[0])?.card ?? null) : null);
      out.push({ ...a, card_id: cardId, card_label: labelFor(cardId), text: null });
    }
    // One missing_statement per card and gap.
    for (const card of cards()) {
      const list = sorted().filter((s) => stCard(s) === card.id);
      for (let i = 1; i < list.length; i += 1) {
        const before = monthOf(list[i - 1]!.period_end);
        const gap = monthsBetween(before, monthOf(list[i]!.period_end));
        if (gap <= 1) continue;
        const missing = Array.from({ length: gap - 1 }, (_, k) => addMonths(before, k + 1));
        const from = missing[0]!;
        const to = missing.at(-1)!;
        const range = from === to ? monthText(from) : `${monthText(from)}–${monthText(to)}`;
        out.push({
          id: `al_missing_statement_${card.id}_${from}`,
          kind: 'missing_statement',
          severity: 'warning',
          month: from,
          message_key: 'alert.missing_statement',
          params: { bank: card.bank, card_last4: card.card_last4, card: card.label, from, to, months: missing.length, month_list: missing },
          refs: { statement_ids: [list[i - 1]!.id, list[i]!.id], transaction_ids: [], plan_ids: [] },
          card_id: card.id,
          card_label: card.label,
          text: tr()
            ? `${card.label} için ${range} ${missing.length > 1 ? 'ekstreleri' : 'ekstresi'} yok. Bankanın uygulamasından PDF olarak indirip ekle.`
            : `${card.label}: the ${range} statement${missing.length > 1 ? 's are' : ' is'} missing. Download the PDF from your bank's app and add it.`,
        });
      }
    }
    const order = { critical: 0, warning: 1, info: 2 } as const;
    return out.sort((a, b) => order[a.severity] - order[b.severity] || a.month.localeCompare(b.month));
  }

  // -- suggestions ------------------------------------------------------------------------------------

  async function ruleSuggestions(): Promise<Suggestion[]> {
    const subs = await subscriptionsNow();
    const schedule = decorateSchedule(await base.getSchedule(12));
    const fees = (await base.listCardFees()).items;
    const out: Suggestion[] = [];
    const sg = (s: Omit<Suggestion, 'currency' | 'card_label' | 'message_key' | 'yearly_saving'> & { yearly_saving?: number | null }): Suggestion => ({
      currency: 'TRY',
      yearly_saving: null,
      ...s,
      card_label: labelFor(s.card_id),
      message_key: `suggestion.${s.kind}`,
    });
    for (const s of subs.filter((x) => x.kind === 'subscription' && x.price_change && Number(x.price_change) > 0 && !x.expected_amount)) {
      out.push(
        sg({
          id: `sg_${hash10(`price:${s.merchant}`)}`,
          kind: 'price_rise',
          title: tr() ? `${s.merchant} ücreti arttı` : `${s.merchant} costs more`,
          body: tr() ? 'Hâlâ kullanıyorsan daha ucuz bir plana geçmeyi düşün.' : 'If you still use it, look at a cheaper plan.',
          monthly_saving: null,
          card_id: s.card_id ?? null,
          source: 'rules',
          link: `/recurring?id=${s.id}`,
          params: { merchant: s.merchant, amount_previous: s.amount_previous, amount_last: s.amount_last },
        }),
      );
    }
    for (const fee of fees.filter((f) => !f.refunded)) {
      const cardId = cardIdOf(fee.bank, fee.card_last4);
      out.push(
        sg({
          id: `sg_${hash10(`fee:${fee.transaction_id}`)}`,
          kind: 'card_fee',
          title: tr() ? 'Kart aidatını geri isteyebilirsin' : 'You can ask for the card fee back',
          body: tr() ? 'Bankana iade talebi yaz; olmazsa hakem heyetine başvur.' : 'Write to your bank; if it says no, go to the consumer board.',
          monthly_saving: Math.round(fee.amount / 12),
          yearly_saving: fee.amount,
          card_id: cardId,
          source: 'rules',
          link: `/rights?id=${fee.transaction_id}`,
          params: { amount: fee.amount, card: labelFor(cardId) },
        }),
      );
    }
    for (const card of cards()) {
      const st = sorted().filter((s) => stCard(s) === card.id).at(-1)!;
      const rows = st.transactions.filter((t) => (t.kind === 'interest' || t.kind === 'tax') && t.direction === 'debit');
      const interest = rows.filter((t) => t.kind === 'interest');
      if (!interest.length) continue;
      const amount = rows.reduce((n, t) => n + t.amount, 0);
      out.push(
        sg({
          id: `sg_${hash10(`interest:${st.id}`)}`,
          kind: 'interest',
          title: tr() ? 'Faiz ödüyorsun' : 'You are paying interest',
          body: tr() ? 'Borcun tamamını son ödeme gününe kadar ödersen bu tutar çıkmaz.' : 'Pay the full balance by the due date and this goes away.',
          monthly_saving: amount,
          yearly_saving: amount * 12,
          card_id: card.id,
          source: 'rules',
          link: `/statements?id=${st.id}`,
          params: { amount, month: monthOf(st.period_end), card: card.label },
        }),
      );
    }
    const places = frequentPlaces(subs).items.filter((p) => FREQUENT_SUGGEST.has(p.category ?? '')).slice(0, 3);
    for (const p of places) {
      const half = Math.round(p.monthly_average / 2);
      out.push(
        sg({
          id: `sg_${hash10(`place:${p.merchant}`)}`,
          kind: 'frequent_place',
          title: tr() ? `${p.merchant} için ayda ortalama harcaman yüksek` : `You spend a lot at ${p.merchant}`,
          body: tr() ? 'Bunu yarıya indirirsen ayda bu kadar kalır.' : 'Halve it and you keep this much a month.',
          monthly_saving: half,
          yearly_saving: half * 12,
          card_id: p.card_ids[0] ?? null,
          source: 'rules',
          link: `/spending?merchant=${encodeURIComponent(p.merchant)}`,
          params: { merchant: p.merchant, monthly_average: p.monthly_average, category: p.category },
        }),
      );
    }
    const months = schedule.months;
    const drop = months.findIndex((m, i) => i > 0 && months[i - 1]!.total > 0 && m.total <= months[i - 1]!.total * 0.9);
    if (drop > 0) {
      const ending = schedule.plans.filter((p) => !p.closed && p.ends === months[drop - 1]!.month).map((p) => p.description);
      out.push(
        sg({
          id: `sg_${hash10(`relief:${months[drop]!.month}`)}`,
          kind: 'installment_relief',
          title: tr() ? 'Taksitlerin azalıyor' : 'Your installments go down',
          body: tr() ? 'O aydan sonra boşalan tutarı birikime ayırabilirsin.' : 'You could set the freed amount aside from then on.',
          monthly_saving: null,
          card_id: null,
          source: 'rules',
          link: '/installments',
          params: { month: months[drop]!.month, amount: months[drop - 1]!.total - months[drop]!.total, plans: ending.length },
        }),
      );
    }
    const saving = (s: Suggestion) => s.monthly_saving ?? -1;
    return out.sort((a, b) => saving(b) - saving(a));
  }

  function makeAiSuggestions(): Suggestion[] {
    const base = { currency: 'TRY', monthly_saving: null, yearly_saving: null, card_id: null, card_label: null, source: 'ai' as const, message_key: null, params: {} };
    return [
      {
        ...base,
        id: 'sg_ai_1',
        kind: 'ai',
        title: tr() ? 'Market alışverişini haftada bire indir' : 'Shop for groceries once a week',
        body: tr()
          ? 'Market harcaman ayın her haftasına dağılmış. Tek ve listeli alışveriş çoğu zaman sepeti küçültür.'
          : 'Your grocery spending is spread over every week. One planned trip usually makes the basket smaller.',
        link: '/spending',
      },
      {
        ...base,
        id: 'sg_ai_2',
        kind: 'ai',
        title: tr() ? 'Yeni taksite Ocak’tan sonra gir' : 'Wait until January for a new installment',
        body: tr()
          ? 'Kasım ve Aralık’ta taksit yükün en yüksek iki ay. Ocak’ta iki plan bitiyor; yeni bir taksit o zaman daha az sıkar.'
          : 'November and December carry your highest installment load. Two plans end in January; a new one hurts less then.',
        link: '/installments',
      },
    ];
  }

  // -- AI batch ----------------------------------------------------------------------------------------

  function needsAnalysis(st: Statement) {
    return st.analysis_status !== 'done' || st.transactions.some((t) => !t.category && t.direction === 'debit');
  }

  function sortRows(st: Statement) {
    for (const tx of st.transactions) {
      if (tx.category || tx.direction !== 'debit') continue;
      const text = fold(tx.description);
      tx.category = MODEL_WORDS.find(([w]) => text.includes(w))?.[1] ?? 'other';
      modelRows.add(tx.id);
    }
  }

  function step() {
    if (!batch || batch.status !== 'pending') return;
    const provider = state.selected;
    if (batch.phase === 'statements') {
      const id = batchQueue.shift();
      const st = id ? state.statements.find((s) => s.id === id) : undefined;
      if (st && provider) {
        sortRows(st);
        hooks.finishAnalysis(st.id, provider);
      }
      batch.done = (batch.done ?? 0) + (id ? 1 : 0);
      if (!batchQueue.length) batch.phase = 'suggestions';
    } else if (batch.phase === 'suggestions') {
      aiSuggestions = makeAiSuggestions();
      aiCreated = new Date().toISOString();
      aiProvider = provider;
      batch.phase = 'done';
      batch.status = 'done';
      return;
    }
    setTimeout(step, hooks.stepMs);
  }

  function startBatch(): AnalysisRun {
    if (batch?.status === 'pending') {
      for (const st of sorted()) {
        if (!needsAnalysis(st) || batchQueue.includes(st.id)) continue;
        batchQueue.push(st.id);
        batch.total = (batch.total ?? 0) + 1;
      }
      return batch;
    }
    batchQueue = sorted()
      .filter(needsAnalysis)
      .map((s) => s.id);
    for (const id of batchQueue) {
      const st = state.statements.find((s) => s.id === id);
      if (st) st.analysis_status = 'pending';
    }
    batch = {
      job_id: `job_all_${hash10(String(Date.now() + Math.random()))}`,
      kind: 'analysis_all',
      statement_id: null,
      status: 'pending',
      phase: batchQueue.length ? 'statements' : 'suggestions',
      done: 0,
      total: batchQueue.length,
      failed: 0,
      error: null,
    };
    setTimeout(step, hooks.stepMs);
    return batch;
  }

  function providerReady() {
    if (!state.selected) throw new ApiError(409, 'no_provider', 'Choose an AI provider first.');
    if (!hooks.providerAvailable(state.selected)) throw new ApiError(409, 'provider_unavailable', 'The selected provider is not available.');
  }

  // -- the adapter --------------------------------------------------------------------------------

  return {
    ...base,
    listStatements: async () => {
      const res = await base.listStatements();
      return { items: res.items.map(decorateStatement) };
    },
    getStatement: async (id) => decorateStatement(await base.getStatement(id)),
    uploadStatementDetailed: async (file, opts) => {
      const res = await base.uploadStatementDetailed(file, opts);
      if (state.selected && hooks.providerAvailable(state.selected)) startBatch();
      return { ...res, statement: decorateStatement(res.statement) };
    },
    uploadStatement: async (file, opts) => {
      const st = await base.uploadStatement(file, opts);
      if (state.selected && hooks.providerAvailable(state.selected)) startBatch();
      return decorateStatement(st);
    },
    listTransactions: async (filter) => {
      const res = await base.listTransactions(filter);
      const map = rowCards();
      return { items: res.items.map((t) => decorateTx(t, map.get(t.id) ?? null)) };
    },
    getSchedule: async (months) => decorateSchedule(await base.getSchedule(months)),
    getSubscriptions: async () => {
      const items = await subscriptionsNow();
      return { items, totals: totalsOf(items) };
    },
    getAlerts: async () => {
      const raw = await base.getAlerts();
      return { items: decorateAlerts(raw.items, decorateSchedule(await base.getSchedule(12)), await subscriptionsNow()) };
    },
    getForecast: async (includeFixed) => {
      const raw = await base.getForecast(includeFixed);
      const schedule = decorateSchedule(await base.getSchedule(12));
      const rows = forecastCards(schedule, await subscriptionsNow());
      const month = rows[0]?.next_statement?.month;
      return {
        ...raw,
        currency: 'TRY',
        total: rows.reduce((n, r) => n + r.amount, 0),
        fixed: schedule.fixed?.months.find((m) => m.month === month)?.total ?? 0,
        cards: rows,
      };
    },
    getWhichCard: async (date) => {
      const res = await base.getWhichCard(date);
      const withCard = <T extends { bank: string; card_last4: string }>(c: T) => ({
        ...c,
        card_id: cardIdOf(c.bank, c.card_last4),
        card_label: labelFor(cardIdOf(c.bank, c.card_last4)) ?? undefined,
      });
      return { ...res, cards: res.cards.map(withCard), best: res.best ? withCard(res.best) : null };
    },

    listCards: () => wait({ items: cards() }),
    renameCard: (id, name) => {
      const card = cards().find((c) => c.id === id);
      if (!card) return reject(404, 'card_not_found', 'No card with this id.');
      const clean = (name ?? '').trim().slice(0, 40);
      if (clean) names.set(id, clean);
      else names.delete(id);
      return wait(cards().find((c) => c.id === id)!);
    },
    closePlan: async (planId) => {
      const schedule = decorateSchedule(await base.getSchedule(12));
      const plan = schedule.plans.find((p) => p.plan_id === planId);
      if (plan?.closed === 'statement') return reject(409, 'closed_by_statement', 'A statement already shows this plan closed.');
      if (!plan) return reject(404, 'plan_not_found', 'No open plan with this id.');
      if (!closedByUser.has(planId)) closedByUser.set(planId, hooks.today());
      return decorateSchedule(await base.getSchedule(12)).plans.find((p) => p.plan_id === planId)!;
    },
    reopenPlan: (planId) => {
      if (!closedByUser.delete(planId)) return reject(404, 'plan_not_closed', 'This plan is not closed.');
      return wait(undefined);
    },
    setSubscriptionExpected: async (id, amount) => {
      const items = await subscriptionsNow();
      if (!items.some((s) => s.id === id)) return reject(404, 'subscription_not_found', 'No regular payment with this id.');
      if (!(amount > 0)) return reject(422, 'validation_error', 'The amount must be above zero.');
      expected.set(id, { amount, since: hooks.today() });
      return (await subscriptionsNow()).find((s) => s.id === id)!;
    },
    clearSubscriptionExpected: (id) => {
      if (!expected.delete(id)) return reject(404, 'expected_not_set', 'No expected amount on this payment.');
      return wait(undefined);
    },
    getSuggestions: async () => {
      const rules = await ruleSuggestions();
      return wait({
        items: [...rules, ...aiSuggestions],
        ai: {
          status: batch?.status === 'pending' ? 'pending' : aiCreated ? 'done' : 'none',
          provider: aiProvider,
          created_at: aiCreated,
          job_id: batch?.job_id ?? null,
        },
      });
    },
    getFrequentPlaces: async (months) => frequentPlaces(await subscriptionsNow(), months ?? 6),
    startAnalysisAll: () => {
      try {
        providerReady();
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error(String(error)));
      }
      const run = startBatch();
      return wait({ job_id: run.job_id, kind: 'analysis_all' as const, status: 'pending' as const, total: run.total ?? 0 });
    },
    getAnalysisAll: () => wait(batch),
    getJob: (jobId) => (batch && jobId === batch.job_id ? wait(batch) : base.getJob(jobId)),
  };
}
