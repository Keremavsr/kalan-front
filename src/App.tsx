import { useEffect, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, MemoryRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ApiProvider } from './api/context';
import { useSettings } from './api/queries';
import type { KalanApi } from './api/types';
import { AppShell } from './components/layout/AppShell';
import { ToastProvider } from './components/ui';
import { InstallmentsPage } from './features/installments/InstallmentsPage';
import { OverviewPage } from './features/overview/OverviewPage';
import { RecurringPage } from './features/recurring/RecurringPage';
import { RightsPage } from './features/rights/RightsPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { SpendingPage } from './features/spending/SpendingPage';
import { StatementsPage } from './features/statements/StatementsPage';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
      mutations: { retry: false },
    },
  });
}

/** Settings on the back end decide the UI language once they load. */
function LocaleSync() {
  const { i18n } = useTranslation();
  const settings = useSettings();
  const locale = settings.data?.locale;
  useEffect(() => {
    if (locale && locale !== i18n.resolvedLanguage) void i18n.changeLanguage(locale);
  }, [locale, i18n]);
  return null;
}

/** Old v0.1 paths keep working: they move to the new screen, keeping the query string. */
function Moved({ to }: { to: string }) {
  const { search } = useLocation();
  return <Navigate to={`${to}${search}`} replace />;
}

function MovedMonth() {
  const { month } = useParams();
  const { search } = useLocation();
  return <Navigate to={`/spending/${month ?? ''}${search}`} replace />;
}

export function AppRoutes() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/installments" element={<InstallmentsPage />} />
        <Route path="/spending" element={<SpendingPage />} />
        <Route path="/spending/:month" element={<SpendingPage />} />
        <Route path="/recurring" element={<RecurringPage />} />
        <Route path="/rights" element={<RightsPage />} />
        <Route path="/statements" element={<StatementsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/month" element={<Moved to="/spending" />} />
        <Route path="/month/:month" element={<MovedMonth />} />
        <Route path="/subscriptions" element={<Moved to="/recurring" />} />
        <Route path="/watch" element={<Moved to="/" />} />
        <Route path="/upload" element={<Moved to="/statements" />} />
        <Route path="/setup" element={<Moved to="/settings" />} />
        <Route path="/calendar" element={<Moved to="/installments" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

interface AppProps {
  api: KalanApi;
  queryClient?: QueryClient;
  /** Tests pass an initial path; the app uses the browser URL. */
  initialPath?: string;
  children?: ReactNode;
}

export function App({ api, queryClient, initialPath }: AppProps) {
  const client = queryClient ?? createQueryClient();
  const content = (
    <>
      <LocaleSync />
      <AppRoutes />
    </>
  );
  return (
    <ApiProvider api={api}>
      <QueryClientProvider client={client}>
        <ToastProvider>
          {initialPath ? (
            <MemoryRouter initialEntries={[initialPath]}>{content}</MemoryRouter>
          ) : (
            <BrowserRouter>{content}</BrowserRouter>
          )}
        </ToastProvider>
      </QueryClientProvider>
    </ApiProvider>
  );
}
