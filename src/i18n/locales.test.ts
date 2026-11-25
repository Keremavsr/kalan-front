import { describe, expect, it } from 'vitest';
import { LANGUAGES, localeTrees } from './resources';

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((acc, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') acc[key] = v;
    else Object.assign(acc, flatten(v, key));
    return acc;
  }, {});
}

const trees = localeTrees();
const flat = Object.fromEntries(LANGUAGES.map((lang) => [lang, flatten(trees[lang] ?? {})])) as Record<
  (typeof LANGUAGES)[number],
  Record<string, string>
>;

describe('locale files', () => {
  it('exist for every language with the same area files', () => {
    const areas = Object.keys(trees.en ?? {}).sort();
    expect(areas.length).toBeGreaterThan(8);
    for (const lang of LANGUAGES) expect(Object.keys(trees[lang] ?? {}).sort()).toEqual(areas);
  });

  it('have the same keys in every language', () => {
    const reference = Object.keys(flat.en).sort();
    for (const lang of ['tr', 'pt', 'es'] as const) expect(Object.keys(flat[lang]).sort()).toEqual(reference);
  });

  it('are complete in Turkish and English', () => {
    for (const lang of ['tr', 'en'] as const) {
      const empty = Object.entries(flat[lang]).filter(([, v]) => !v.trim());
      expect(empty).toEqual([]);
    }
  });

  it('use the same placeholders and marks in Turkish and English', () => {
    const vars = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}|<(\w)>/g)].map((m) => m[1] ?? `<${m[2]}>`).sort();
    for (const key of Object.keys(flat.en)) expect(vars(flat.tr[key]!), key).toEqual(vars(flat.en[key]!));
  });

  it('ring at most one figure per sentence', () => {
    for (const lang of ['tr', 'en'] as const)
      for (const [key, value] of Object.entries(flat[lang])) expect((value.match(/<c>/g) ?? []).length, key).toBeLessThanOrEqual(1);
  });

  it('keep Turkish copy calm: no exclamation marks', () => {
    expect(Object.values(flat.tr).filter((v) => v.includes('!'))).toEqual([]);
  });

  it('use the invented example amount 1.234,56 / 1,234.56 everywhere', () => {
    const all = [...Object.values(flat.tr), ...Object.values(flat.en)].join('\n');
    expect(all).not.toMatch(/1[.,]149[.,]50/);
    expect(flat.tr['manual.amountHint']).toContain('1.234,56');
    expect(flat.en['manual.amountHint']).toContain('1,234.56');
  });
});
