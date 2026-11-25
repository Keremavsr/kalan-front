import { MARGIN_PATH } from './paths';

/** Pencil mark at the start of a critical line. Pair it with the word itself; colour never carries meaning alone. */
export function MarginMark({ className }: { className?: string }) {
  return (
    <svg className={['margin-mark', className].filter(Boolean).join(' ')} viewBox="0 0 24 24" aria-hidden focusable="false">
      <path d={MARGIN_PATH} />
    </svg>
  );
}
