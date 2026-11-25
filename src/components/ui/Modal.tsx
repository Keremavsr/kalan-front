import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Native <dialog> opened with showModal(): focus is trapped, Escape closes,
 * focus returns to the trigger. A paper sheet lifted off the ground; enter and exit are CSS (index.css).
 */
export function Modal({ open, onClose, title, description, children, footer }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();
  const { t } = useTranslation();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="modal m-auto w-full max-w-xl rounded-card bg-paper p-0 text-ink shadow-lift"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="mx-7 flex items-start justify-between gap-4 border-b border-ink pt-6 pb-4">
        <div>
          <h2 id={titleId} className="title-section">
            {title}
          </h2>
          {description ? (
            <p id={descId} className="mt-2 text-body text-muted">
              {description}
            </p>
          ) : null}
        </div>
        <Button variant="icon" size="sm" onClick={onClose} aria-label={t('common.close')} icon={<X aria-hidden className="size-4" />} />
      </div>
      <div className="px-7 py-6">{children}</div>
      {footer ? <div className="flex justify-end gap-3 px-7 pb-6">{footer}</div> : null}
    </dialog>
  );
}
