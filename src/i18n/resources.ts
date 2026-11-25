/**
 * Locale files live in locales/<lang>/<area>.json, one file per screen area, so screens can be
 * written in parallel without touching one big file. The file name is the top-level key:
 * locales/tr/installments.json holds every `installments.*` key.
 */
type Tree = { [key: string]: string | Tree };

const files = import.meta.glob<Tree>('./locales/*/*.json', { eager: true, import: 'default' });

export const LANGUAGES = ['tr', 'en', 'es', 'pt'] as const;
export type Language = (typeof LANGUAGES)[number];

export function localeTrees(): Record<string, Record<string, Tree>> {
  const out: Record<string, Record<string, Tree>> = {};
  for (const [path, tree] of Object.entries(files)) {
    const match = /\.\/locales\/([^/]+)\/([^/]+)\.json$/.exec(path);
    if (!match) continue;
    const [, lang, area] = match as unknown as [string, string, string];
    (out[lang] ??= {})[area] = tree;
  }
  return out;
}

export function resources() {
  const trees = localeTrees();
  return Object.fromEntries(Object.entries(trees).map(([lang, areas]) => [lang, { translation: areas }]));
}
