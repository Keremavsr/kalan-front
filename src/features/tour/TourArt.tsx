import { cx } from '../../lib/cx';

/**
 * The three tour drawings, drawn in code with the token colours: a statement dropped into the app,
 * this month's cards next to the months of instalments left, and a local tool sorting spending into
 * categories with two suggestions. Decorative: the step text says the same thing.
 */
export function TourArt({ step, className }: { step: 'drop' | 'see' | 'ai'; className?: string }) {
  return (
    <svg viewBox="0 0 400 160" className={cx('overflow-visible', className)} aria-hidden focusable="false">
      {step === 'drop' ? <Drop /> : step === 'see' ? <See /> : <Ai />}
    </svg>
  );
}

const line = 'stroke-ink';

function Drop() {
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      {/* The drop area */}
      <rect x="70" y="92" width="260" height="60" rx="14" className={cx('fill-paper', line)} strokeWidth="2" strokeDasharray="7 6" />
      <path d="M170 122h60" className="stroke-line" strokeWidth="6" />
      {/* The statement, a little tilted, on its way down */}
      <g transform="rotate(-6 200 46)" className="tour-drop">
        <path d="M168 4h46l18 18v62h-64z" className={cx('fill-paper', line)} strokeWidth="2" />
        <path d="M214 4v18h18" className={cx('fill-ground-alt', line)} strokeWidth="2" />
        <path d="M178 34h32M178 44h42M178 54h26M178 64h38" className={line} strokeWidth="2.5" />
        <rect x="178" y="71" width="22" height="7" rx="1.5" className="fill-ink" />
      </g>
      {/* Arrow into the area */}
      <path d="M262 56v28m-8-8 8 8 8-8" className={cx('fill-none', line)} strokeWidth="2.5" />
    </g>
  );
}

const MONTHS = [62, 54, 40, 40, 34, 34, 28, 22, 0, 0, 0, 0];

function See() {
  return (
    <g strokeLinecap="round">
      {/* This month: one row per card */}
      {[0, 1].map((i) => (
        <g key={i} transform={`translate(8 ${18 + i * 58})`}>
          <rect width="160" height="46" rx="10" className="fill-paper" />
          <rect x="12" y="14" width="26" height="18" rx="4" className={i === 0 ? 'fill-ink' : 'fill-series-prusya'} />
          <path d="M50 18h44M50 30h28" className="stroke-line" strokeWidth="5" />
          <path d={i === 0 ? 'M120 23h28' : 'M128 23h20'} className={line} strokeWidth="5" />
        </g>
      ))}
      <path d="M8 138h160" className={line} strokeWidth="2" />
      <path d="M120 150h48" className={line} strokeWidth="5" />
      {/* Months of instalments left */}
      <g transform="translate(200 18)">
        {MONTHS.map((h, i) =>
          h ? (
            <rect
              key={i}
              x={i * 16}
              y={120 - h * 1.6}
              width="12"
              height={h * 1.6}
              className="bar-y fill-series-ink"
              style={{ transitionDelay: `${i * 30}ms` }}
            />
          ) : null,
        )}
        <path d="M0 120.5h188" className={line} strokeWidth="1.5" />
        <circle cx="6" cy="132" r="3" className="fill-ink" />
      </g>
    </g>
  );
}

/** Category slices: [left edge, width, fill]. */
const PARTS: [number, number, string][] = [
  [0, 59, 'fill-series-ink'],
  [62, 41, 'fill-series-prusya'],
  [106, 31, 'fill-series-asi'],
  [140, 23, 'fill-series-toprak'],
  [166, 17, 'fill-series-gri'],
];

function Ai() {
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      {/* The tool on this computer */}
      <rect x="8" y="34" width="128" height="88" rx="10" className="fill-anchor" />
      <path d="M24 58l10 8-10 8M42 74h18" className="fill-none stroke-paper" strokeWidth="2.5" />
      <path d="M24 92h56M24 104h36" className="stroke-paper" strokeWidth="2" strokeDasharray="1 7" />
      {/* Connection */}
      <path d="M140 78h44" className={line} strokeWidth="2" strokeDasharray="4 5" />
      {/* Categories */}
      <g transform="translate(196 34)">
        {PARTS.map(([x, w, fill]) => (
          <rect key={fill} x={x} y="0" width={w} height="30" className={cx('bar-x', fill)} />
        ))}
        {/* Two suggestions */}
        {[0, 1].map((i) => (
          <g key={i} transform={`translate(0 ${48 + i * 24})`}>
            <path d="M0 0l5 5 9-10" className={cx('fill-none', line)} strokeWidth="2.5" />
            <path d={i === 0 ? 'M24 0h120' : 'M24 0h92'} className="stroke-line" strokeWidth="6" />
          </g>
        ))}
      </g>
    </g>
  );
}
