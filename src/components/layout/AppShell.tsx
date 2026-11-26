import { useEffect, useState, type ReactNode } from 'react';
import { Plus, Settings } from 'lucide-react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useProviders } from '../../api/queries';
import { Logo } from '../brand/Logo';
import { Scribble } from '../pencil';
import { Button, buttonClass, ErrorBoundary, silentFallback } from '../ui';
import { ManualEntryModal } from '../../features/manual/ManualEntryModal';
import { cx } from '../../lib/cx';
import { useTour } from '../../features/tour/Tour';
import { AnalysisStrip } from '../../features/ai/AnalysisStrip';
import { useAutoAnalysis } from '../../features/ai/autoStart';

/** Main menu, in reading order. Settings sits apart as an icon. */
const NAV = [
  { to: '/', key: 'nav.overview', end: true },
  { to: '/installments', key: 'nav.installments', end: false },
  { to: '/spending', key: 'nav.spending', end: false },
  { to: '/recurring', key: 'nav.recurring', end: false },
  { to: '/rights', key: 'nav.rights', end: false },
  { to: '/statements', key: 'nav.statements', end: false },
] as const;

/** A sheet that failed to render closes, so the next "Ekle" opens a fresh one. */
function CloseOnError({ onClose }: { onClose: () => void }) {
  useEffect(() => onClose(), [onClose]);
  return null;
}

function useScrolled() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const check = () => setScrolled(window.scrollY > 4);
    check();
    window.addEventListener('scroll', check, { passive: true });
    return () => window.removeEventListener('scroll', check);
  }, []);
  return scrolled;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const providers = useProviders();
  const selected = providers.data?.providers.find((p) => p.id === providers.data?.selected);
  const isMock = import.meta.env.VITE_KALAN_MOCK === '1';
  const scrolled = useScrolled();
  const [manualOpen, setManualOpen] = useState(false);
  const tour = useTour();
  const { pathname } = useLocation();
  useAutoAnalysis();

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-pill bg-ink px-4 py-2 text-paper focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {t('common.skipToContent')}
      </a>
      <header
        className={cx(
          'sticky top-0 z-40 border-b bg-ground transition-[border-color] duration-(--duration-2) ease-(--ease-out)',
          scrolled ? 'border-line' : 'border-transparent',
        )}
      >
        <div className="mx-auto flex h-(--header-height) max-w-content items-center gap-6 px-(--space-gutter)">
          <Link to="/" aria-label={t('nav.home')} className="shrink-0 rounded-sm py-2">
            <Logo className="h-7 w-auto text-ink" />
          </Link>
          <nav aria-label={t('nav.label')} className="ml-auto min-w-0">
            <ul className="flex items-center gap-x-5 text-table font-semibold xl:gap-x-7">
              {NAV.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className="scribble-host relative inline-flex min-h-11 items-center whitespace-nowrap text-ink"
                  >
                    {t(item.key)}
                    <Scribble seed={item.to} />
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="primary" size="sm" dot={<Plus aria-hidden className="size-4" />} onClick={() => setManualOpen(true)}>
              {t('nav.add')}
            </Button>
            <NavLink
              to="/settings"
              aria-label={t('nav.settings')}
              title={t('nav.settings')}
              className={({ isActive }) => cx(buttonClass('icon', 'sm'), isActive && 'bg-ink! text-paper!')}
            >
              <Settings aria-hidden className="size-4" />
            </NavLink>
          </div>
        </div>
        <ErrorBoundary fallback={silentFallback}>
          <AnalysisStrip />
        </ErrorBoundary>
      </header>

      <main id="main" tabIndex={-1} className="w-full flex-1 focus:outline-none">
        <div className="mx-auto max-w-content px-(--space-gutter) pt-10 pb-16">
          {/* One screen failing leaves the menu working; moving to another screen clears it. */}
          <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>
        </div>
      </main>

      <footer className="mx-auto w-full max-w-content px-(--space-gutter) pb-6">
        <p className="flex flex-wrap gap-x-5 gap-y-1 border-t border-line pt-4 text-meta text-muted">
          <span>{selected ? t('nav.providerSelected', { name: selected.name }) : t('nav.providerNone')}</span>
          {isMock ? <span>{t('common.demoData')}</span> : null}
          <button
            type="button"
            onClick={tour.open}
            className="ml-auto rounded-sm text-ink underline decoration-1 underline-offset-4 transition-[text-decoration-color] duration-(--duration-1) hover:decoration-transparent"
          >
            {t('tour.link')}
          </button>
        </p>
      </footer>

      <ErrorBoundary fallback={() => <CloseOnError onClose={() => setManualOpen(false)} />} resetKey={manualOpen}>
        <ManualEntryModal open={manualOpen} onClose={() => setManualOpen(false)} />
      </ErrorBoundary>
    </div>
  );
}
