import { describe, expect, it } from 'vitest';
import tr from './locales/tr.json';
import en from './locales/en.json';
import pt from './locales/pt.json';
import es from './locales/es.json';

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((acc, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') acc[key] = v;
    else Object.assign(acc, flatten(v, key));
    return acc;
  }, {});
}

const flat = { tr: flatten(tr), en: flatten(en), pt: flatten(pt), es: flatten(es) };

describe('locale files', () => {
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

  it('use the same placeholders in Turkish and English', () => {
    const vars = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(flat.en)) expect(vars(flat.tr[key]!), key).toEqual(vars(flat.en[key]!));
  });

  it('keep Turkish copy calm: no exclamation marks', () => {
    expect(Object.values(flat.tr).filter((v) => v.includes('!'))).toEqual([]);
  });
});
