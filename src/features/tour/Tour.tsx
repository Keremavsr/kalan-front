import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Slices } from '../../components/brand/Logo';
import { Button } from '../../components/ui';
import { TourArt } from './TourArt';

/** Set once the tour has been closed, finished or skipped. Lives in local storage, not on the back end. */
export const TOUR_KEY = 'kalan.tourSeen';

function seen() {
  try {
    return globalThis.localStorage?.getItem(TOUR_KEY) === '1';
  } catch {
    return true;
  }
}

function markSeen() {
  try {
    globalThis.localStorage?.setItem(TOUR_KEY, '1');
  } catch {
    /* storage unavailable: the tour shows again next time, nothing breaks */
  }
}

interface TourContextValue {
  open: () => void;
}

const TourContext = createContext<TourContextValue>({ open: () => undefined });

/** Opens the tour from anywhere ("Nasıl çalışır?"). */
// eslint-disable-next-line react-refresh/only-export-components -- the hook belongs with its provider
export function useTour() {
  return useContext(TourContext);
}

const STEPS = ['drop', 'see', 'ai'] as const;

/**
 * First-run tour: three steps, one sentence and one small drawing each. It opens by itself the first
 * time the app starts and can be skipped at any step. The last step leads to the upload screen.
 */
export function TourProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(() => !seen());
  const open = useCallback(() => setOpen(true), []);
  const value = useMemo(() => ({ open }), [open]);
  return (
    <TourContext.Provider value={value}>
      {children}
      {isOpen ? (
        <TourDialog
          onClose={() => {
            markSeen();
            setOpen(false);
          }}
        />
      ) : null}
    </TourContext.Provider>
  );
}

function TourDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const [step, setStep] = useState(0);
  const key = STEPS[step]!;
  const last = step === STEPS.length - 1;

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  function finish() {
    onClose();
    void navigate('/statements');
  }

  return (
    <dialog
      ref={ref}
      className="modal m-auto w-full max-w-2xl rounded-card bg-paper p-0 text-ink shadow-lift"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="mx-7 flex items-center justify-between gap-4 border-b border-ink pt-6 pb-4">
        <p className="text-meta font-semibold text-ink">{t('tour.label')}</p>
        <div className="flex items-center gap-4">
          <Slices
            count={STEPS.length}
            filled={step + 1}
            className="h-3.5 w-auto text-ink"
            label={t('tour.progress', { n: step + 1, total: STEPS.length })}
          />
          <Button variant="icon" size="sm" onClick={onClose} aria-label={t('tour.skip')} icon={<X aria-hidden className="size-4" />} />
        </div>
      </div>

      <div key={key} className="enter grid gap-6 px-7 pt-7 pb-6">
        <div className="rounded-card bg-ground px-6 py-6">
          <TourArt step={key} className="mx-auto h-40 w-full max-w-md" />
        </div>
        <div>
          <p className="text-meta text-muted">{t('tour.step', { n: step + 1, total: STEPS.length })}</p>
          <h2 id={titleId} className="title-section mt-1 text-ink">
            {t(`tour.${key}.title`)}
          </h2>
          <p id={bodyId} className="mt-3 max-w-measure text-lead text-ink">
            {t(`tour.${key}.body`)}
          </p>
          {key === 'ai' ? <p className="mt-2 max-w-measure text-meta text-muted">{t('tour.ai.sent')}</p> : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-7 pb-7">
        <Button variant="ghost" onClick={onClose}>
          {t('tour.skip')}
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          {step > 0 ? (
            <Button variant="secondary" icon={<ArrowLeft aria-hidden className="size-4" />} onClick={() => setStep(step - 1)}>
              {t('tour.back')}
            </Button>
          ) : null}
          {last ? (
            <Button variant="go" dot={<ArrowRight aria-hidden className="size-4" />} onClick={finish}>
              {t('tour.finish')}
            </Button>
          ) : (
            <Button variant="primary" dot={<ArrowRight aria-hidden className="size-4" />} onClick={() => setStep(step + 1)}>
              {t('tour.next')}
            </Button>
          )}
        </div>
      </div>
    </dialog>
  );
}
