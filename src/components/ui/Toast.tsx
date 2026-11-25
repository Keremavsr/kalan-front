import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MarginMark } from '../pencil';
import { cx } from '../../lib/cx';

type ToastTone = 'positive' | 'negative' | 'neutral';

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
  leaving: boolean;
}

interface ToastApi {
  show: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const VISIBLE_MS = 5000;
const EXIT_MS = 160;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), EXIT_MS);
  }, []);

  const show = useCallback((message: string, tone: ToastTone = 'neutral') => {
    const id = nextId.current++;
    setItems((list) => [...list.slice(-2), { id, message, tone, leaving: false }]);
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed right-6 bottom-6 z-50 flex w-sm max-w-[calc(100vw-3rem)] flex-col gap-2"
      >
        {items.map((item) => (
          <ToastView key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** A note lifted off the page: anchor ink, paper text. A failure carries the pencil mark. */
function ToastView({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const { t } = useTranslation();
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || item.leaving) return;
    const timer = setTimeout(() => onDismiss(item.id), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [paused, item.id, item.leaving, onDismiss]);

  return (
    <div
      className={cx(
        'enter on-anchor pointer-events-auto flex items-start gap-3 rounded-card bg-anchor px-5 py-4 text-body text-paper shadow-lift',
        item.leaving && 'opacity-0 transition-opacity duration-(--duration-exit)',
      )}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {item.tone === 'negative' ? <MarginMark className="mt-0.5" /> : null}
      {item.tone === 'positive' ? <Check aria-hidden className="mt-1 size-4 shrink-0" /> : null}
      <p className="flex-1">{item.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        className="pressable -mr-1 grid size-7 place-items-center rounded-pill text-paper hover:bg-paper hover:text-ink"
        aria-label={t('common.dismiss')}
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
