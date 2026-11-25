import type { ReactNode } from 'react';
import { CIRCLE_PATH } from './paths';

/** The one figure on a screen that matters, ringed by hand. Use at most once per view. */
export function Circled({ children }: { children?: ReactNode }) {
  return (
    <span className="circled font-semibold" data-pencil="circle">
      {children}
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden focusable="false">
        <path pathLength={1} d={CIRCLE_PATH} />
      </svg>
    </span>
  );
}
