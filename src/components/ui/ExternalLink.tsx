import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { cx } from '../../lib/cx';
import { buttonClass } from './Button';

/**
 * A link that leaves the app (the desktop shell opens it in the browser). `button` draws it as the
 * outline pill; otherwise a plain underlined link. The arrow says it goes outside.
 */
export function ExternalLink({
  href,
  children,
  button = false,
  className,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode; button?: boolean }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={cx(
        button
          ? buttonClass('secondary', 'md', 'gap-2')
          : 'inline-flex items-baseline gap-0.5 break-all text-ink underline decoration-1 underline-offset-4 hover:decoration-transparent',
        className,
      )}
      {...rest}
    >
      {children}
      <ArrowUpRight aria-hidden className={button ? 'size-4' : 'size-3.5 shrink-0 self-center'} />
    </a>
  );
}

/** A source shown beside a legal value: a link when it is a URL, the plain text otherwise. */
export function SourceText({ source, className }: { source: string; className?: string }) {
  const url = /^https?:\/\//.test(source.trim());
  if (!url) return <span className={cx('text-meta text-muted', className)}>{source}</span>;
  let label = source;
  try {
    label = new URL(source).hostname.replace(/^www\./, '');
  } catch {
    /* keep the raw text */
  }
  return (
    <ExternalLink href={source} className={cx('text-meta', className)} title={source}>
      {label}
    </ExternalLink>
  );
}
