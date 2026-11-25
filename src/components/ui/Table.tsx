import type { ComponentProps, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cx } from '../../lib/cx';

export interface TableProps {
  caption: ReactNode;
  captionHidden?: boolean;
  className?: string;
  tableClassName?: string;
  /** Wide tables scroll inside their own box; the page never scrolls sideways. The box is positioned so
   *  visually hidden (absolute) labels inside cells stay inside it too. */
  scroll?: boolean;
  children: ReactNode;
}

export function Table({ caption, captionHidden = false, className, tableClassName, scroll = true, children }: TableProps) {
  return (
    <div className={cx(scroll && 'relative max-w-full overflow-x-auto overscroll-x-contain', className)}>
      <table className={cx('w-full border-collapse text-table', tableClassName)}>
        <caption className={captionHidden ? 'sr-only' : 'px-6 pb-3 text-left text-meta text-muted'}>{caption}</caption>
        {children}
      </table>
    </div>
  );
}

/** Head row: small bold labels over an ink rule, like the list header of the site. */
export function THead({ children }: { children: ReactNode }) {
  return <thead className="border-b border-ink text-left">{children}</thead>;
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function TFoot({ children }: { children: ReactNode }) {
  return <tfoot className="border-t border-ink">{children}</tfoot>;
}

export function Tr({ className, ...rest }: ComponentProps<'tr'>) {
  return <tr className={cx('border-b border-line last:border-b-0', className)} {...rest} />;
}

interface CellProps {
  numeric?: boolean;
  /** Stays in place while the rest of the row scrolls sideways (the plan column of a wide table). */
  sticky?: boolean;
}

const stickyClass = 'sticky left-0 z-10 bg-paper after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-line';

export function Th({ numeric, sticky, className, scope = 'col', ...rest }: ThHTMLAttributes<HTMLTableCellElement> & CellProps) {
  return (
    <th
      scope={scope}
      className={cx(
        'first:pl-6 last:pr-6',
        // Column headers are small labels; row headers read like body text. Callers set the weight of row headers.
        scope === 'row' ? 'px-3 py-3 align-top text-table text-ink' : 'px-3 pt-3 pb-2 text-meta font-semibold text-ink',
        numeric ? 'text-right' : 'text-left',
        sticky && stickyClass,
        className,
      )}
      {...rest}
    />
  );
}

/** Cells inherit the ink colour, so callers can set a muted colour without a class conflict. */
export function Td({ numeric, sticky, className, ...rest }: TdHTMLAttributes<HTMLTableCellElement> & CellProps) {
  return (
    <td
      className={cx('px-3 py-3 align-top first:pl-6 last:pr-6', numeric && 'text-right whitespace-nowrap', sticky && stickyClass, className)}
      {...rest}
    />
  );
}
