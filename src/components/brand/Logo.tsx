import { LOGO_LEFT, LOGO_PAID, LOGO_STROKE, LOGO_VIEWBOX, LOGO_WORD } from './logo-paths';

/**
 * The kalan mark: an instalment pill cut into four, two paid (filled) and two left (outlined),
 * then the lowercase word. Drawn in currentColor. The name and logo are not under the MIT licence (NOTICE).
 */
export function Logo({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox={LOGO_VIEWBOX}
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <path d={LOGO_WORD} fill="currentColor" />
      {LOGO_PAID.map((d) => (
        <path key={d} d={d} fill="currentColor" />
      ))}
      {LOGO_LEFT.map((d) => (
        <path key={d} d={d} fill="none" stroke="currentColor" strokeWidth={LOGO_STROKE} />
      ))}
    </svg>
  );
}

/**
 * The slice pill on its own, for empty and done states: `filled` of `count` slices drawn solid.
 * Empty (filled 0) means nothing here yet; full means the job is done.
 */
export function Slices({ count = 4, filled, className, label }: { count?: number; filled: number; className?: string; label?: string }) {
  const h = 20;
  const w = 28;
  const gap = 2.4;
  const stroke = 3;
  const r = h / 2;
  const total = count * w + (count - 1) * gap;
  const parts = Array.from({ length: count }, (_, i) => {
    const solid = i < filled;
    const inset = solid ? 0 : stroke / 2;
    const x = i * (w + gap) + inset;
    const right = i * (w + gap) + w - inset;
    const top = inset;
    const bottom = h - inset;
    const rr = r - inset;
    let d: string;
    if (i === 0) d = `M${x + rr} ${top}H${right}V${bottom}H${x + rr}A${rr} ${rr} 0 0 1 ${x + rr} ${top}Z`;
    else if (i === count - 1) d = `M${x} ${top}H${right - rr}A${rr} ${rr} 0 0 1 ${right - rr} ${bottom}H${x}Z`;
    else d = `M${x} ${top}H${right}V${bottom}H${x}Z`;
    return solid ? (
      <path key={i} d={d} fill="currentColor" />
    ) : (
      <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth={stroke} />
    );
  });
  return (
    <svg
      viewBox={`0 0 ${total} ${h}`}
      className={className}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {parts}
    </svg>
  );
}
