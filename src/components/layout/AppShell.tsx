import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useProviders, useStatements } from '../../api/queries';
import { cx } from '../../lib/cx';

const primary = [
  { to: '/', key: 'nav.calendar', end: true },
  { to: '/month', key: 'nav.month', end: false },
  { to: '/subscriptions', key: 'nav.subscriptions', end: false },
  { to: '/watch', key: 'nav.watch', end: false },
] as const;

const secondary = [
  { to: '/upload', key: 'nav.upload', end: false },
  { to: '/setup', key: 'nav.setup', end: false },
] as const;

function NavItem({ to, label, end }: { to: string; label: string; end: boolean }) {
  return (
    <li>
      <NavLink
        to={to}
        end={end}
        className={({ isActive }) =>
          cx(
            'pressable relative flex h-9 items-center rounded-sm px-3 text-sm',
            'before:absolute before:top-2 before:bottom-2 before:left-0 before:w-0.5 before:rounded-full before:transition-colors before:duration-(--duration-fast)',
            isActive ? 'font-medium text-ink before:bg-ink' : 'text-ink-muted before:bg-transparent hover:bg-sunken hover:text-ink',
          )
        }
      >
        {label}
      </NavLink>
    </li>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const providers = useProviders();
  const statements = useStatements();
  const latest = statements.data?.items[0];
  const selected = providers.data?.providers.find((p) => p.id === providers.data?.selected);
  const isMock = import.meta.env.VITE_KALAN_MOCK === '1';

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-ink px-3 py-2 text-paper focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {t('common.skipToContent')}
      </a>
      <aside className="sticky top-0 flex h-dvh w-sidebar shrink-0 flex-col border-r border-line bg-paper px-4 py-6">
        <div className="px-3">
          <p className="font-display text-2xl leading-none font-semibold tracking-tight text-ink">kalan</p>
          {latest ? <p className="mt-2 font-mono text-xs text-ink-muted">{t('common.card', { last4: latest.card_last4 })}</p> : null}
        </div>
        <nav aria-label={t('nav.label')} className="mt-8 flex flex-1 flex-col">
          <ul className="flex flex-col gap-0.5">
            {primary.map((item) => (
              <NavItem key={item.to} to={item.to} label={t(item.key)} end={item.end} />
            ))}
          </ul>
          <ul className="mt-6 flex flex-col gap-0.5 border-t border-line pt-6">
            {secondary.map((item) => (
              <NavItem key={item.to} to={item.to} label={t(item.key)} end={item.end} />
            ))}
          </ul>
        </nav>
        <div className="space-y-1 px-3 text-xs text-ink-muted">
          <p>{selected ? t('nav.providerSelected', { name: selected.name }) : t('nav.providerNone')}</p>
          {isMock ? <p>{t('common.demoData')}</p> : null}
        </div>
      </aside>
      <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-10 py-10 focus:outline-none">
        <div className="mx-auto max-w-content">{children}</div>
      </main>
    </div>
  );
}
