import { describe, expect, it } from 'vitest';
import tokens from './tokens.css?raw';
import statusCss from '../../desktop/static/status.css?raw';

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
  ['font family name', /Bricolage|IBM Plex|Source Serif|font-family:\s*['"]/],
  ['monospaced type', /font-mono|monospace/],
  ['raw arbitrary size', /\b(?:text|rounded|shadow)-\[\d/],
  // Kerem's rule: a background never repeats the text colour at low opacity (no tinted badges).
  ['tinted fill (colour with opacity modifier)', /\b(?:bg|border|ring|outline|fill)-[a-z-]+\/\d{1,3}\b/],
];

// The vermilion pencil may only be used by the pencil components and their stylesheet.
const PENCIL_USE = /--color-pencil|\b(?:bg|text|border|stroke|fill|ring|outline|decoration|caret|shadow|accent|from|to|via)-pencil|pencil-text/;
const PENCIL_HOME = (path: string) => path.startsWith('/src/components/pencil/') || path === '/src/styles/pencil.css';

describe('design tokens', () => {
  it('found source files to check', () => {
    expect(Object.keys(files).length).toBeGreaterThan(30);
  });

  for (const [name, pattern] of rules) {
    it(`no ${name} outside tokens.css`, () => {
      const offenders = Object.entries(files)
        .filter(([, text]) => pattern.test(text))
        .map(([path]) => path);
      expect(offenders).toEqual([]);
    });
  }

  it('use the pencil colour only in the pencil components', () => {
    const users = Object.entries(files)
      .filter(([, text]) => PENCIL_USE.test(text))
      .map(([path]) => path);
    expect(users.filter((p) => !PENCIL_HOME(p))).toEqual([]);
    expect(users).toContain('/src/styles/pencil.css');
  });

  it('turn every movement off under prefers-reduced-motion', () => {
    const reduced = tokens.slice(tokens.indexOf('@media (prefers-reduced-motion: reduce)'));
    for (const name of ['--duration-1', '--duration-2', '--duration-3', '--press-scale', '--enter-offset', '--bar-from'])
      expect(reduced, name).toContain(name);
  });

  it('keep the desktop status page on the same colours as tokens.css', () => {
    const value = (css: string, name: string) => new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css)?.[1]?.toLowerCase();
    for (const [status, token] of [
      ['--ground', '--color-ground'],
      ['--ground-alt', '--color-ground-alt'],
      ['--paper', '--color-paper'],
      ['--line', '--color-line'],
      ['--ink', '--color-ink'],
      ['--muted', '--color-muted'],
      ['--go', '--color-go'],
      ['--pencil', '--color-pencil'],
    ] as const) {
      expect(value(statusCss, status), status).toBe(value(tokens, token));
    }
  });
});
