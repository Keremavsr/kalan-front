import type { ComponentProps, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cx } from '../../lib/cx';

export interface TableProps {
  caption: ReactNode;
  captionHidden?: boolean;
  className?: string;
  tableClassName?: string;
  children: ReactNode;
}

export function Table({ caption, captionHidden = false, className, tableClassName, children }: TableProps) {
  return (
    <div className={cx('overflow-x-auto', className)}>
      <table className={cx('w-full border-collapse text-sm', tableClassName)}>
        <caption className={captionHidden ? 'sr-only' : 'px-5 pb-3 text-left text-sm text-ink-muted'}>{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="border-y border-line bg-sunken text-left">{children}</thead>;
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function TFoot({ children }: { children: ReactNode }) {
  return <tfoot className="border-t-2 border-line-strong">{children}</tfoot>;
}

export function Tr({ className, ...rest }: ComponentProps<'tr'>) {
  return <tr className={cx('border-b border-line last:border-b-0', className)} {...rest} />;
}

interface CellProps {
  numeric?: boolean;
}

export function Th({ numeric, className, scope = 'col', ...rest }: ThHTMLAttributes<HTMLTableCellElement> & CellProps) {
  return (
    <th
      scope={scope}
      className={cx(
        'first:pl-5 last:pr-5',
        // Column headers are small labels; row headers read like body text. Callers set the weight of row headers.
        scope === 'row' ? 'px-3 py-2.5 align-top text-sm text-ink' : 'px-3 py-2 text-xs font-medium text-ink-muted',
        numeric ? 'text-right' : 'text-left',
        className,
      )}
      {...rest}
    />
  );
}

/** Cells inherit the ink colour, so callers can set a muted or status colour without a class conflict. */
export function Td({ numeric, className, ...rest }: TdHTMLAttributes<HTMLTableCellElement> & CellProps) {
  return (
    <td
      className={cx('px-3 py-2.5 align-top first:pl-5 last:pr-5', numeric && 'text-right font-mono tabular', className)}
      {...rest}
    />
  );
}
