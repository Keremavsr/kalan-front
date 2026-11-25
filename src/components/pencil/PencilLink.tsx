import type { ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { cx } from '../../lib/cx';
import { Scribble } from './Scribble';

/** In-app text link: a thin ink underline at rest, the pencil scribble on hover and focus. */
export function PencilLink({ children, className, seed, ...rest }: LinkProps & { children: ReactNode; seed?: string }) {
  return (
    <Link
      className={cx(
        'scribble-host relative underline decoration-1 underline-offset-4 transition-[text-decoration-color] duration-(--duration-1) hover:decoration-transparent',
        className,
      )}
      {...rest}
    >
      {children}
      <Scribble seed={seed ?? (typeof rest.to === 'string' ? rest.to : 'link')} />
    </Link>
  );
}
