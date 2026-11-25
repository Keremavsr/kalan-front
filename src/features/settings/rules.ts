import type { RuleOverrides } from '../../api/types';

/** Rates are percent per month ("3.08"); shares are fractions ("0.15") shown and typed as percent. */
export type OverrideKey = keyof RuleOverrides;
export const OVERRIDE_KEYS: OverrideKey[] = ['contractual_monthly', 'late_monthly', 'bsmv', 'kkdf', 'minimum_ratio'];
export const isRate = (key: OverrideKey) => key === 'contractual_monthly' || key === 'late_monthly';

export interface RuleDefault {
  /** Values as the data file gives them (rates in percent, shares as fractions); several when the value has tiers. */
  values: string[];
  source: string | null;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? v.map(obj) : []);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

/** The dated set in effect on `today`: the latest one that has started, else the first. */
function current(sets: Obj[], today: string): Obj {
  const started = sets.filter((s) => (str(s.effective_from) ?? '') <= today);
  return started.at(-1) ?? sets[0] ?? {};
}

/**
 * What the dated rules file says for each override field, with its source. Reads the shape of
 * `tr_card_rules.json`; a simpler shape (as in the mock) is read too, without a source.
 */
export function ruleDefaults(rules: Obj, today: string): Record<OverrideKey, RuleDefault> {
  const interest = obj(rules.interest);
  const set = current(arr(interest.sets), today);
  const tiers = arr(set.tiers);
  const taxes = obj(rules.taxes_on_interest);
  const minimum = obj(rules.minimum_payment);
  const minSet = current(arr(minimum.sets), today);
  const pick = (list: Obj[], key: string) => list.map((t) => str(t[key])).filter((v): v is string => v !== null);
  const one = (v: unknown) => (str(v) ? [str(v)!] : []);

  return {
    contractual_monthly: {
      values: tiers.length ? pick(tiers, 'contractual_monthly') : one(interest.contractual_max_monthly),
      source: str(set.source),
    },
    late_monthly: { values: tiers.length ? pick(tiers, 'late_monthly') : one(interest.late_max_monthly), source: str(set.source) },
    bsmv: { values: one(taxes.bsmv), source: str(taxes.source) },
    kkdf: { values: one(taxes.kkdf), source: str(taxes.source) },
    minimum_ratio: {
      values: arr(minSet.tiers).length ? pick(arr(minSet.tiers), 'ratio') : one(minimum.ratio),
      source: str(minSet.source),
    },
  };
}

/** Shown in the field: rates as they are, shares turned into percent. Decimal point for the user's locale. */
export function toField(key: OverrideKey, value: string | null, decimal: string): string {
  if (value === null) return '';
  const shown = isRate(key) ? value : trim((Number(value) * 100).toFixed(4));
  return shown.replace('.', decimal);
}

const trim = (s: string) => (s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s);

/** What the user typed, back to the API's string, or `undefined` when it is not a valid value. Empty = no override. */
export function fromField(key: OverrideKey, input: string): string | null | undefined {
  const text = input.trim().replace(',', '.').replace(/^%/, '').replace(/%$/, '').trim();
  if (!text) return null;
  // Rates keep up to 4 decimals; a share typed as percent keeps 2, so the fraction has at most 4.
  if (!(isRate(key) ? /^\d{1,2}(\.\d{1,4})?$/ : /^\d{1,3}(\.\d{1,2})?$/).test(text)) return undefined;
  const n = Number(text);
  if (isRate(key)) return n > 0 ? trim(text) : undefined;
  if (n > 100) return undefined;
  return trim((n / 100).toFixed(4));
}
