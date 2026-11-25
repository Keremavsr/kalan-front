// Pure helpers behind the mock adapter. They follow the contract's rules closely enough for screens
// to be built against them; they are not a second implementation of kalan-back and skip its edge cases.
import type {
  CardOption,
  ExportFormat,
  FixedCost,
  FixedCostMatches,
  IsoDate,
  IsoMonth,
  Locale,
  MinimumPaymentCycle,
  Schedule,
  SchedulePlan,
  Simulation,
  SimulationRequest,
  Statement,
  Transaction,
} from './types';
import { FIXED_HOLIDAYS } from './fixtures-v03';
import { addMonths, monthOf } from '../lib/month';

// -- dates ----------------------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const toUtc = (iso: IsoDate) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const fromUtc = (ms: number): IsoDate => new Date(ms).toISOString().slice(0, 10);

export const addDays = (iso: IsoDate, days: number): IsoDate => fromUtc(toUtc(iso) + days * DAY_MS);
export const daysBetween = (from: IsoDate, to: IsoDate) => Math.round((toUtc(to) - toUtc(from)) / DAY_MS);

export function daysInMonth(month: IsoMonth): number {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** `day` of `month`, clipped to the month's length. */
export function dateIn(month: IsoMonth, day: number): IsoDate {
  return `${month}-${String(Math.min(day, daysInMonth(month))).padStart(2, '0')}`;
}

function isBusinessDay(iso: IsoDate): boolean {
  const weekday = new Date(toUtc(iso)).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !FIXED_HOLIDAYS.includes(iso.slice(5));
}

export function nextBusinessDay(iso: IsoDate): IsoDate {
  let day = iso;
  while (!isBusinessDay(day)) day = addDays(day, 1);
  return day;
}

// -- text -----------------------------------------------------------------------------------------

/** Case, diacritics and Turkish I folded, like the back end's merchant matching. */
export function fold(text: string): string {
  return text
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .replace(/ı/g, 'i')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when the folded phrase appears as whole words in the folded text. */
export function matchesWords(text: string, phrase: string): boolean {
  const words = fold(text).split(/[^\p{L}\p{N}-]+/u).filter(Boolean);
  const target = fold(phrase).split(/[^\p{L}\p{N}-]+/u).filter(Boolean);
  if (!target.length) return false;
  for (let i = 0; i + target.length <= words.length; i += 1) {
    if (target.every((w, j) => words[i + j] === w)) return true;
  }
  return false;
}

export const ratio = (value: number) => (Number.isFinite(value) ? value.toFixed(2) : '0.00');

export const countsAsSpend = (tx: Transaction) =>
  tx.direction === 'debit' && tx.kind !== 'payment' && tx.kind !== 'carry_over';

export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

// -- simulate installment -------------------------------------------------------------------------

export function simulate(body: SimulationRequest, schedule: Schedule, windowMonths: number): Simulation {
  const { amount, count, start_month } = body;
  const rate = body.interest_monthly ? Number(body.interest_monthly) / 100 : 0;
  const installments: Simulation['purchase']['installments'] = [];
  if (!rate) {
    const each = Math.floor(amount / count);
    const first = amount - each * (count - 1);
    for (let i = 0; i < count; i += 1) {
      const value = i === 0 ? first : each;
      installments.push({ month: addMonths(start_month, i), amount: value, principal: value, interest: 0 });
    }
  } else {
    const payment = Math.round((amount * rate) / (1 - (1 + rate) ** -count));
    let balance = amount;
    for (let i = 0; i < count; i += 1) {
      const interest = Math.round(balance * rate);
      const principal = i === count - 1 ? balance : payment - interest;
      balance -= principal;
      installments.push({ month: addMonths(start_month, i), amount: principal + interest, principal, interest });
    }
  }
  const totalCost = installments.reduce((s, it) => s + it.amount, 0);
  const start = schedule.months[0]?.month ?? start_month;
  const months = Array.from({ length: windowMonths }, (_, i) => {
    const month = addMonths(start, i);
    const without = schedule.months.find((m) => m.month === month)?.total ?? 0;
    const purchase = installments.find((it) => it.month === month)?.amount ?? 0;
    return { month, without, purchase, with: without + purchase };
  });
  const peakOf = (key: 'without' | 'with') =>
    months.reduce((best, m) => (m[key] > best.total ? { month: m.month, total: m[key] } : best), {
      month: months[0]?.month ?? start,
      total: months[0]?.[key] ?? 0,
    });
  return {
    currency: schedule.currency,
    purchase: {
      amount,
      count,
      start_month,
      interest_monthly: body.interest_monthly ?? null,
      installments,
      total_cost: totalCost,
      interest_total: totalCost - amount,
      ends: addMonths(start_month, count - 1),
    },
    months,
    peak: { without: peakOf('without'), with: peakOf('with') },
  };
}

// -- minimum payment ------------------------------------------------------------------------------

export interface MinimumInputs {
  statement: Statement;
  monthly: number; // percent per month
  bsmv: number; // share of interest
  kkdf: number;
  minimumRatio: number;
  charges: Record<IsoMonth, number> | null;
  maxCycles?: number;
}

export function minimumCycles(input: MinimumInputs) {
  const { statement, monthly, bsmv, kkdf, minimumRatio, charges } = input;
  const cycles: MinimumPaymentCycle[] = [];
  let balance = statement.statement_total;
  let cutOff = statement.period_end;
  const cutDay = Number(statement.period_end.slice(8, 10));
  let totals = { paid: 0, interest: 0, bsmv: 0, kkdf: 0 };
  for (let cycle = 1; cycle <= (input.maxCycles ?? 600) && balance > 0; cycle += 1) {
    const due = cycle === 1 ? statement.minimum_payment : Math.ceil(balance * minimumRatio);
    const payment = Math.min(balance, Math.max(due, 1));
    const unpaid = balance - payment;
    const next = dateIn(addMonths(monthOf(cutOff), 1), cutDay);
    const days = daysBetween(cutOff, next);
    const interest = Math.round((unpaid * monthly) / 100 * (days / 30));
    const taxB = Math.round(interest * bsmv);
    const taxK = Math.round(interest * kkdf);
    const added = charges?.[monthOf(next)] ?? 0;
    const nextBalance = unpaid + interest + taxB + taxK + added;
    cycles.push({ cycle, cut_off: cutOff, balance, payment, unpaid, days, interest, bsmv: taxB, kkdf: taxK, added, next_balance: nextBalance });
    totals = { paid: totals.paid + payment, interest: totals.interest + interest, bsmv: totals.bsmv + taxB, kkdf: totals.kkdf + taxK };
    balance = nextBalance;
    cutOff = next;
  }
  return { cycles, totals, balanceLeft: balance, lastCutOff: cycles.at(-1)?.cut_off ?? null };
}

// -- which card -----------------------------------------------------------------------------------

export function cardOption(st: Statement, date: IsoDate): CardOption {
  const offset = daysBetween(st.period_end, st.due_date);
  const cutDay = Number(st.period_end.slice(8, 10));
  let cutOff: IsoDate;
  let due: IsoDate;
  let basis: CardOption['basis'];
  if (st.next_period_end && st.next_due_date && st.next_period_end >= date) {
    cutOff = st.next_period_end;
    due = st.next_due_date;
    basis = 'printed';
  } else {
    cutOff = dateIn(monthOf(date), cutDay);
    if (cutOff < date) cutOff = dateIn(addMonths(monthOf(date), 1), cutDay);
    due = addDays(cutOff, offset);
    basis = 'projected';
  }
  const effective = nextBusinessDay(due);
  return {
    bank: st.bank,
    product: st.product,
    card_last4: st.card_last4,
    statement_id: st.id,
    cut_off: cutOff,
    cut_off_day: cutDay,
    due_offset_days: offset,
    due_date: due,
    due_date_effective: effective,
    shifted_days: daysBetween(due, effective),
    interest_free_days: daysBetween(date, effective),
    days_until_cut_off: daysBetween(date, cutOff),
    first_installment_month: monthOf(cutOff),
    basis,
    stale: daysBetween(st.period_end, date) > 45,
  };
}

// -- share card -----------------------------------------------------------------------------------

export function shareSentence(schedule: Schedule, locale: Locale, amounts: boolean): string {
  const months = schedule.months.slice(0, 12);
  const busy = months.filter((m) => m.total > 0).length;
  const peak = months.reduce((best, m) => (m.total > best.total ? m : best), months[0] ?? { month: '', total: 0 });
  if (!busy) return locale === 'tr' ? 'Önümüzdeki 12 ayda taksit yükü yok.' : 'No installment load in the next 12 months.';
  const rounded = `${Math.round(peak.total / 100).toLocaleString('tr-TR')} ${schedule.currency}`;
  if (locale === 'tr') {
    return `Önümüzdeki 12 ayın ${busy} ayında taksit var; en yoğun ay ${peak.month}${amounts ? ` (${rounded})` : ''}.`;
  }
  return `Installments fall in ${busy} of the next 12 months; the busiest is ${peak.month}${amounts ? ` (${rounded})` : ''}.`;
}

export function shareSvg(months: { month: IsoMonth; share: string }[], sentence: string): string {
  const width = 1200;
  const height = 630;
  const barWidth = 70;
  const gap = 20;
  const baseY = 520;
  const bars = months
    .map((m, i) => {
      const h = Math.round(Number(m.share) * 320);
      const x = 90 + i * (barWidth + gap);
      return `<rect x="${x}" y="${baseY - h}" width="${barWidth}" height="${h}" fill="steelblue"/><text x="${x + barWidth / 2}" y="${baseY + 30}" font-size="18" text-anchor="middle" fill="dimgray">${m.month.slice(5)}</text>`;
    })
    .join('');
  const safe = sentence.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="system-ui, sans-serif"><rect width="100%" height="100%" fill="ivory"/><text x="90" y="110" font-size="34" fill="black">${safe}</text>${bars}</svg>`;
}

// -- fixed-cost matching --------------------------------------------------------------------------

export const FIXED_TOLERANCE = { amount: 0.075, days: 2 };

const activeIn = (cost: FixedCost, month: IsoMonth) => month >= cost.start && (cost.end === null || month <= cost.end);

export function matchFixedCosts(costs: FixedCost[], rows: Transaction[]): FixedCostMatches {
  const dataMonths = [...new Set(rows.map((t) => monthOf(t.date)))].sort();
  const first = dataMonths[0];
  const last = dataMonths.at(-1);
  const candidates = rows.filter((t) => t.direction === 'debit' && !t.installment && t.kind !== 'payment');
  const report: FixedCostMatches = {
    tolerance: { amount: String(FIXED_TOLERANCE.amount), days: FIXED_TOLERANCE.days },
    costs: [],
    duplicates: [],
  };
  for (const cost of costs) {
    const matches: FixedCostMatches['costs'][number]['matches'] = [];
    for (const month of dataMonths.filter((m) => activeIn(cost, m))) {
      const target = dateIn(month, cost.day);
      const best = candidates
        .filter((t) => t.currency === cost.currency)
        .map((t) => ({ t, dayDiff: Math.abs(daysBetween(target, t.date)), amountDiff: t.amount - cost.amount }))
        .filter((c) => c.dayDiff <= FIXED_TOLERANCE.days && Math.abs(c.amountDiff) <= cost.amount * FIXED_TOLERANCE.amount)
        .sort((a, b) => a.dayDiff - b.dayDiff || Math.abs(a.amountDiff) - Math.abs(b.amountDiff))[0];
      if (best) {
        matches.push({
          fixed_cost_id: cost.id,
          month,
          transaction_id: best.t.id,
          date: best.t.date,
          amount: best.t.amount,
          amount_diff: best.amountDiff,
          day_diff: daysBetween(target, best.t.date),
        });
      }
    }
    const missing: IsoMonth[] = [];
    if (first && last) {
      for (let m = addMonths(first, 1); m < last; m = addMonths(m, 1)) {
        if (activeIn(cost, m) && !matches.some((x) => x.month === m)) missing.push(m);
      }
    }
    report.costs.push({ fixed_cost_id: cost.id, name: cost.name, amount: cost.amount, currency: cost.currency, day: cost.day, matches, missing_months: missing });
  }
  for (let i = 0; i < costs.length; i += 1) {
    for (let j = i + 1; j < costs.length; j += 1) {
      const a = costs[i]!;
      const b = costs[j]!;
      const overlap = (a.end === null || b.start <= a.end) && (b.end === null || a.start <= b.end);
      const amountDiff = Math.abs(a.amount - b.amount);
      const dayGap = Math.abs(a.day - b.day);
      if (overlap && a.currency === b.currency && amountDiff <= Math.max(a.amount, b.amount) * FIXED_TOLERANCE.amount && dayGap <= 2) {
        report.duplicates.push({ fixed_cost_ids: [a.id, b.id], same_name: fold(a.name) === fold(b.name), amount_diff: amountDiff, day_gap: dayGap });
      }
    }
  }
  return report;
}

// -- export ---------------------------------------------------------------------------------------

export interface ExportRow {
  tx: Transaction;
  account: string;
}

const dec = (minor: number) => (minor / 100).toFixed(2);
const csvCell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
const installmentText = (tx: Transaction) =>
  tx.installment?.index && tx.installment.total_count ? `${tx.installment.index}/${tx.installment.total_count}` : '';

export function exportText(
  format: ExportFormat,
  what: 'transactions' | 'plans',
  rows: ExportRow[],
  plans: SchedulePlan[],
  currency: string,
): { text: string; skipped: number } {
  const list = rows.filter((r) => r.tx.kind !== 'carry_over');
  if (format === 'csv' && what === 'plans') {
    const head = 'plan_id,description,kind,source,amount_each,remaining_count,ends,total_remaining,currency';
    const body = plans.map((p) =>
      [p.plan_id, csvCell(p.description), p.kind, p.source ?? 'statement', dec(p.amount_each), p.remaining_count, p.ends, dec(p.total_remaining), currency].join(','),
    );
    return { text: [head, ...body].join('\n') + '\n', skipped: 0 };
  }
  if (format === 'csv') {
    const head = 'date,description,debit,credit,currency,installment,kind,category,source,account,id';
    const body = list.map(({ tx, account }) =>
      [
        tx.date,
        csvCell(tx.description),
        tx.direction === 'debit' ? dec(tx.amount) : '',
        tx.direction === 'credit' ? dec(tx.amount) : '',
        tx.currency,
        installmentText(tx),
        tx.kind,
        tx.category ?? '',
        tx.source,
        account,
        tx.id,
      ].join(','),
    );
    return { text: [head, ...body].join('\n') + '\n', skipped: 0 };
  }
  if (format === 'ofx') {
    const kept = list.filter((r) => r.tx.currency === currency);
    const entries = kept
      .map(({ tx }) => {
        const signed = tx.direction === 'debit' ? -tx.amount : tx.amount;
        const memo = installmentText(tx);
        return `<STMTTRN><TRNTYPE>${signed < 0 ? 'DEBIT' : 'CREDIT'}</TRNTYPE><DTPOSTED>${tx.date.replace(/-/g, '')}</DTPOSTED><TRNAMT>${dec(signed)}</TRNAMT><FITID>${tx.id}</FITID><NAME>${tx.description}</NAME>${memo ? `<MEMO>${memo}</MEMO>` : ''}</STMTTRN>`;
      })
      .join('\n');
    const text = `<?xml version="1.0" encoding="UTF-8"?>\n<?OFX OFXHEADER="200" VERSION="220"?>\n<OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><CURDEF>${currency}</CURDEF><BANKTRANLIST>\n${entries}\n</BANKTRANLIST></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>\n`;
    return { text, skipped: list.length - kept.length };
  }
  const expense = (tx: Transaction) =>
    tx.kind === 'payment' ? 'assets:payments' : `expenses:${tx.category ?? tx.kind}`;
  if (format === 'hledger') {
    const entries = list.map(({ tx, account }) => {
      const signed = tx.direction === 'debit' ? tx.amount : -tx.amount;
      return `${tx.date} ${tx.description}  ; kind:${tx.kind}, source:${tx.source}, id:${tx.id}${installmentText(tx) ? `, installment:${installmentText(tx)}` : ''}\n    ${expense(tx)}  ${dec(signed)} ${tx.currency}\n    ${account}`;
    });
    const periodic = plans.map(
      (p) => `~ monthly from ${p.ends.slice(0, 4)}-01 to ${p.ends}  ${p.description}\n    expenses:installments  ${dec(p.amount_each)} ${currency}\n    liabilities:card`,
    );
    return { text: [...entries, ...periodic].join('\n\n') + '\n', skipped: 0 };
  }
  const accounts = [...new Set(list.map((r) => r.account))];
  const opens = accounts.map((a) => `2000-01-01 open ${a}`);
  const entries = list.map(({ tx, account }) => {
    const signed = tx.direction === 'debit' ? tx.amount : -tx.amount;
    return `${tx.date} * "${tx.description.replace(/"/g, "'")}"\n  kalan-id: "${tx.id}"\n  kind: "${tx.kind}"\n  ${expense(tx).replace(/^expenses/, 'Expenses').replace(/^assets/, 'Assets')}  ${dec(signed)} ${tx.currency}\n  ${account}`;
  });
  const custom = plans.map((p) => `2000-01-01 custom "kalan-plan" "${p.plan_id}" ${dec(p.amount_each)} ${currency}`);
  return { text: [`option "operating_currency" "${currency}"`, ...opens, ...entries, ...custom].join('\n\n') + '\n', skipped: 0 };
}

export const EXPORT_MEDIA: Record<ExportFormat, string> = {
  hledger: 'text/plain',
  beancount: 'text/plain',
  ofx: 'application/x-ofx',
  csv: 'text/csv',
};

// -- CSV import -----------------------------------------------------------------------------------

export interface ParsedRow {
  date: IsoDate;
  description: string;
  amount: number; // signed, minor units, negative = charge after sign detection
  installment: { index: number; total: number } | null;
}

export interface ParsedCsv {
  rows: ParsedRow[];
  detected: { delimiter: string; decimal: string; date_format: string; date_ambiguous: boolean; sign: string; columns: Record<string, string | null> };
}

const COLUMN_NAMES: Record<'date' | 'description' | 'amount', string[]> = {
  date: ['date', 'tarih', 'data', 'fecha', 'islem tarihi'],
  description: ['description', 'aciklama', 'descricao', 'descripcion', 'islem'],
  amount: ['amount', 'tutar', 'valor', 'importe'],
};

function parseAmount(text: string, decimal: string): number {
  const clean = text.replace(/\s/g, '');
  const normalized = decimal === ',' ? clean.replace(/\./g, '').replace(',', '.') : clean.replace(/,/g, '');
  return Math.round(Number(normalized) * 100);
}

function parseDate(text: string): { iso: IsoDate; format: string } | null {
  const t = text.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return { iso: `${m[1]}-${m[2]}-${m[3]}`, format: 'YYYY-MM-DD' };
  m = /^(\d{2})([./])(\d{2})\2(\d{4})$/.exec(t);
  if (m) return { iso: `${m[4]}-${m[3]}-${m[1]}`, format: m[2] === '.' ? 'DD.MM.YYYY' : 'DD/MM/YYYY' };
  return null;
}

/** Minimal CSV reader: header row, date / description / amount columns, ; or , or tab. */
export function parseCsv(text: string, mapping: { delimiter?: string; decimal?: string } = {}): ParsedCsv | null {
  const lines = text.replace(/^\s+/u, '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return null;
  const delimiter = mapping.delimiter ?? ([';', '\t', ','].find((d) => lines[0]!.includes(d)) ?? ',');
  const header = lines[0]!.split(delimiter).map((h) => fold(h.replace(/"/g, '')));
  const find = (names: string[]) => header.findIndex((h) => names.includes(h));
  const col = { date: find(COLUMN_NAMES.date), description: find(COLUMN_NAMES.description), amount: find(COLUMN_NAMES.amount) };
  if (col.date < 0 || col.description < 0 || col.amount < 0) return null;
  const decimal = mapping.decimal ?? (delimiter === ';' ? ',' : '.');
  const rows: ParsedRow[] = [];
  let format = 'YYYY-MM-DD';
  for (const line of lines.slice(1)) {
    const cells = line.split(delimiter).map((c) => c.replace(/^"|"$/g, '').trim());
    const date = parseDate(cells[col.date] ?? '');
    const amount = parseAmount(cells[col.amount] ?? '', decimal);
    if (!date || !Number.isFinite(amount)) return null;
    format = date.format;
    const description = cells[col.description] ?? '';
    const k = /(\d{1,2})\s*\/\s*(\d{1,2})\b/.exec(description);
    rows.push({ date: date.iso, description, amount, installment: k ? { index: Number(k[1]), total: Number(k[2]) } : null });
  }
  const negatives = rows.filter((r) => r.amount < 0).length;
  const sign = negatives * 2 >= rows.length ? 'negative_debit' : 'positive_debit';
  const original = lines[0]!.split(delimiter).map((h) => h.replace(/"/g, '').trim());
  return {
    rows,
    detected: {
      delimiter,
      decimal,
      date_format: format,
      date_ambiguous: rows.every((r) => Number(r.date.slice(8, 10)) <= 12) && format !== 'YYYY-MM-DD',
      sign,
      columns: { date: original[col.date] ?? null, description: original[col.description] ?? null, amount: original[col.amount] ?? null },
    },
  };
}

