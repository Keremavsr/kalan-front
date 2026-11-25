import type { IsoMonth } from './types';

const SHARE_MONTHS = {
  tr: ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};
const SHARE_TITLE = { tr: 'Taksit yükü, önümüzdeki {n} ay', en: 'Installment load, next {n} months' };
const SHARE_FOOT = { tr: 'kalan ile hesaplandı', en: 'computed with kalan' };

/**
 * A copy of the back end's card drawing (`kalan.insights.share_card.load_svg`) for the demo, same layout and
 * palette. The image is self-contained, so its colours are written here like on the back end, not taken from tokens.
 */
export function shareSvg(
  months: { month: IsoMonth; share: string; total?: number }[],
  sentence: string,
  locale: 'tr' | 'en' = 'tr',
): string {
  const W = 1200;
  const H = 630;
  const [bg, ink, muted, peakFill, rule] = ['#ECECE6', '#181B26', '#515561', '#4F6B4A', '#CCCCC2'];
  const font = "'Bricolage Grotesque', system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
  const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const name = (m: IsoMonth, short = false) => {
    const [y, mm] = m.split('-').map(Number);
    const n = SHARE_MONTHS[locale][(mm ?? 1) - 1] ?? '';
    return short ? n.slice(0, 3) : `${n} ${y}`;
  };
  const [left, right, base, chartH] = [80, W - 80, 530, 270];
  const slot = (right - left) / Math.max(months.length, 1);
  const barW = slot * 0.62;
  const shares = months.map((m) => Number(m.share));
  const peak = shares.indexOf(Math.max(0, ...shares));
  const mark = [0, 1, 2, 3]
    .map((i) => {
      const x = left + i * 26;
      const rx = i === 0 || i === 3 ? 8 : 2;
      return i < 2
        ? `<rect x="${x}" y="56" width="22" height="16" rx="${rx}" fill="${ink}"/>`
        : `<rect x="${x + 1}" y="57" width="20" height="14" rx="${rx}" fill="none" stroke="${ink}" stroke-width="2"/>`;
    })
    .join('');
  const bars = months
    .map((m, i) => {
      const x = left + i * slot + (slot - barW) / 2;
      const share = shares[i] ?? 0;
      const h = share ? Math.max(Math.round(chartH * share), 4) : 0;
      const cx = (x + barW / 2).toFixed(1);
      const bar = h ? `<rect x="${x.toFixed(1)}" y="${base - h}" width="${barW.toFixed(1)}" height="${h}" fill="${i === peak ? peakFill : ink}"/>` : '';
      const amount =
        m.total && h
          ? `<text x="${cx}" y="${base - h - 12}" text-anchor="middle" font-family="${font}" font-size="18" fill="${ink}">${Math.round(m.total / 100).toLocaleString('tr-TR')}</text>`
          : '';
      return `${bar}<text x="${cx}" y="${base + 38}" text-anchor="middle" font-family="${font}" font-size="22" fill="${muted}">${esc(name(m.month, true))}</text>${amount}`;
    })
    .join('');
  const first = months[0];
  const last = months[months.length - 1];
  const span = first && last ? `<text x="${left}" y="202" font-family="${font}" font-size="26" fill="${muted}">${esc(`${name(first.month)} – ${name(last.month)}`)}</text>` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(sentence)}">` +
    `<rect width="${W}" height="${H}" fill="${bg}"/>${mark}` +
    `<text x="${left + 114}" y="71" font-family="${font}" font-size="30" font-weight="800" font-stretch="75%" fill="${ink}">kalan</text>` +
    `<text x="${left}" y="160" font-family="${font}" font-size="56" font-weight="800" font-stretch="75%" letter-spacing="-1" fill="${ink}">${esc(SHARE_TITLE[locale].replace('{n}', String(months.length)))}</text>` +
    `<line x1="${left}" y1="${base}" x2="${right}" y2="${base}" stroke="${rule}" stroke-width="2"/>${bars}${span}` +
    `<text x="${right}" y="70" text-anchor="end" font-family="${font}" font-size="20" fill="${muted}">${SHARE_FOOT[locale]}</text></svg>`
  );
}
