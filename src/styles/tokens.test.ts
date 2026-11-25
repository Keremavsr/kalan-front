import { describe, expect, it } from 'vitest';

// Every source file except the token file and tests.
const files = import.meta.glob<string>(['/src/**/*.{ts,tsx,css}', '!/src/styles/tokens.css', '!/src/**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

const PALETTE =
  /\b(?:bg|text|border|ring|outline|fill|stroke|from|to|via|decoration|accent|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-\d{2,3})?\b/;

const rules: Array<[string, RegExp]> = [
  ['hex colour', /#[0-9a-fA-F]{3,8}\b(?![\w-])/],
  ['colour function', /\b(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\(/],
  ['default palette class', PALETTE],
  ['font family name', /IBM Plex(?! (?:Sans|Mono)\/)|Source Serif 4'|font-family:\s*['"]/],
  ['raw arbitrary size', /\b(?:text|rounded|shadow)-\[\d/],
];

describe('design tokens', () => {
  it('found source files to check', () => {
    expect(Object.keys(files).length).toBeGreaterThan(20);
  });

  for (const [name, pattern] of rules) {
    it(`no ${name} outside tokens.css`, () => {
      const offenders = Object.entries(files)
        .filter(([, text]) => pattern.test(text))
        .map(([path]) => path);
      expect(offenders).toEqual([]);
    });
  }
});
