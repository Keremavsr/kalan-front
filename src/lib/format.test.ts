import { describe, expect, it } from 'vitest';
import { foldForSearch, formatDate, formatMoney, formatMonth, formatPercent, NBSP, parseAmountToMinor } from './format';
import { addMonths, monthsBetween, monthRange } from './month';

const plain = (s: string) => s.split(NBSP).join(' ');

describe('formatMoney', () => {
  it('writes Turkish lira as "1.234,56 TL"', () => {
    expect(plain(formatMoney(123456, 'TRY', 'tr-TR'))).toBe('1.234,56 TL');
    expect(plain(formatMoney(2899452, 'TRY', 'tr-TR'))).toBe('28.994,52 TL');
  });

  it('keeps the amount and TL on one line', () => {
    expect(formatMoney(123456, 'TRY', 'tr-TR')).toContain(`${NBSP}TL`);
  });

  it('uses the ISO code in English', () => {
    expect(plain(formatMoney(123456, 'TRY', 'en-GB'))).toBe('TRY 1,234.56');
  });

  it('handles signs and bare numbers', () => {
    expect(plain(formatMoney(14999, 'TRY', 'tr-TR', { signDisplay: 'exceptZero' }))).toBe('+149,99 TL');
    expect(formatMoney(-14500, 'TRY', 'tr-TR', { bare: true })).toBe('-145,00');
  });

  it('respects currencies without minor units', () => {
    expect(plain(formatMoney(1500, 'JPY', 'en-GB'))).toBe('JPY 1,500');
  });
});

describe('dates and percents', () => {
  it('formats in the given locale', () => {
    expect(formatDate('2026-11-04', 'tr-TR', 'long')).toBe('4 Kasım 2026');
    expect(formatMonth('2027-01', 'tr-TR')).toBe('Ocak 2027');
    expect(formatPercent('0.20', 'tr-TR')).toBe('%20');
    expect(formatPercent('0.20', 'en-GB', { signDisplay: 'exceptZero' })).toBe('+20%');
  });
});

describe('parseAmountToMinor', () => {
  it('reads Turkish and English input', () => {
    expect(parseAmountToMinor('1.149,50', 'tr-TR', 'TRY')).toBe(114950);
    expect(parseAmountToMinor('1234', 'tr-TR', 'TRY')).toBe(123400);
    expect(parseAmountToMinor('1,149.50', 'en-GB', 'TRY')).toBe(114950);
  });

  it('rejects text, zero and too many decimals', () => {
    expect(parseAmountToMinor('abc', 'tr-TR', 'TRY')).toBeNull();
    expect(parseAmountToMinor('0', 'tr-TR', 'TRY')).toBeNull();
    expect(parseAmountToMinor('1,999', 'tr-TR', 'TRY')).toBeNull();
  });
});

describe('month helpers', () => {
  it('crosses year boundaries', () => {
    expect(addMonths('2026-11', 2)).toBe('2027-01');
    expect(addMonths('2027-01', -1)).toBe('2026-12');
    expect(monthsBetween('2026-10', '2027-06')).toBe(8);
    expect(monthRange('2026-12', 3)).toEqual(['2026-12', '2027-01', '2027-02']);
  });
});

describe('foldForSearch', () => {
  it('matches ASCII input against Turkish casing', () => {
    expect(foldForSearch('MIGROS-ORNEK', 'tr-TR')).toContain(foldForSearch('migros', 'tr-TR'));
    expect(foldForSearch('İade Eczane', 'tr-TR')).toBe('iade eczane');
  });
});
