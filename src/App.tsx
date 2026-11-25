import { useEffect, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ApiProvider } from './api/context';
import { useSettings } from './api/queries';
import type { KalanApi } from './api/types';
import { AppShell } from './components/layout/AppShell';
import { ToastProvider } from './components/ui';
import { CalendarPage } from './features/calendar/CalendarPage';
import { MonthPage } from './features/month/MonthPage';
import { SetupPage } from './features/setup/SetupPage';
import { SubscriptionsPage } from './features/subscriptions/SubscriptionsPage';
import { UploadPage } from './features/upload/UploadPage';
import { WatchPage } from './features/watch/WatchPage';

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

export function AppRoutes() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<CalendarPage />} />
        <Route path="/month" element={<MonthPage />} />
        <Route path="/month/:month" element={<MonthPage />} />
        <Route path="/subscriptions" element={<SubscriptionsPage />} />
        <Route path="/watch" element={<WatchPage />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/setup" element={<SetupPage />} />
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
