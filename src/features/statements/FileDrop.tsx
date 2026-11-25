import { useId, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { FileUp, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Dot, buttonClass } from '../../components/ui';
import { cx } from '../../lib/cx';

export interface FileDropProps {
  /** Large: the statement drop zone. Compact: a single row for the secondary uploads. */
  size?: 'large' | 'compact';
  title: string;
  hint: string;
  accept: string;
  chooseLabel: string;
  disabled?: boolean;
  onFile: (file: File) => void;
  children?: ReactNode;
}

/** A dashed paper zone that takes a dropped file or opens the picker. The input stays the real control. */
export function FileDrop({ size = 'large', title, hint, accept, chooseLabel, disabled = false, onFile, children }: FileDropProps) {
  const { t } = useTranslation();
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();

  function take(file: File | undefined) {
    if (!file || disabled) return;
    onFile(file);
    // Let the same file be chosen again after a failed try.
    if (inputRef.current) inputRef.current.value = '';
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    take(event.dataTransfer.files[0]);
  }

  const large = size === 'large';
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cx(
        'rounded-card border border-dashed',
        'transition-[border-color,background-color] duration-(--duration-1) ease-(--ease-out)',
        dragging ? 'border-solid border-ink bg-ground-alt' : 'border-ink bg-paper',
        large
          ? 'flex flex-col items-center justify-center gap-3 px-6 py-14 text-center'
          : 'flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4',
      )}
    >
      {large ? <FileUp aria-hidden className="size-6 text-ink" /> : null}
      <div className={large ? 'grid gap-3' : 'min-w-0'}>
        <p className={large ? 'text-lead font-bold text-ink' : 'font-semibold text-ink'}>{title}</p>
        {large ? <p className="text-meta text-muted">{t('statements.or')}</p> : <p className="text-meta text-muted">{hint}</p>}
      </div>
      <div>
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={accept}
          className="peer sr-only"
          disabled={disabled}
          onChange={(e) => take(e.target.files?.[0])}
        />
        <label
          htmlFor={id}
          className={cx(
            large ? buttonClass('go', 'md', undefined, true) : buttonClass('secondary', 'md'),
            'cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-ink',
            disabled && 'pointer-events-none opacity-55',
          )}
        >
          {chooseLabel}
          {large ? (
            <Dot>
              <Plus className="size-4" />
            </Dot>
          ) : null}
        </label>
      </div>
      {large ? <p className="text-meta text-muted">{hint}</p> : null}
      {children}
    </div>
  );
}
