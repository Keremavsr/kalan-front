import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Scribble } from '../pencil';
import { cx } from '../../lib/cx';

/**
 * A button that reads like a text link (show more, open a detail, remove): the thin ink underline at rest,
 * the pencil scribble on hover and focus, no pill and no padding, so it lines up with the text around it.
 */
export function TextButton({
  children,
  className,
  seed,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; seed?: string }) {
  return (
    <button
      type={type}
      className={cx(
        'scribble-host relative inline cursor-pointer text-left font-semibold text-ink underline decoration-1 underline-offset-4',
        'transition-[text-decoration-color] duration-(--duration-1) hover:decoration-transparent focus-visible:decoration-transparent',
        'disabled:cursor-not-allowed disabled:opacity-55',
        className,
      )}
      {...rest}
    >
      {children}
      <Scribble seed={seed ?? (typeof children === 'string' ? children : 'text-button')} />
    </button>
  );
}
