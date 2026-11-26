import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { App, createQueryClient } from '../App';
import { ApiProvider } from '../api/context';
import { createMockApi } from '../api/mock';
import { useAnalysisRun } from '../api/queries';
import type { AnalysisRun, KalanApi, StatementSummary, Transaction } from '../api/types';
import { AppShell } from '../components/layout/AppShell';
import { ErrorBoundary, errorDetail, ToastProvider } from '../components/ui';
import { TourProvider } from './tour/Tour';
import { AUTO_RUN_KEY, batchAllowsStart, hasUncategorizedRow, hasUnreadStatement, localDay } from './ai/autoStart';

/** A component that fails on purpose while rendering. */
function Boom(): ReactNode {
  throw new TypeError('invented render failure');
}

function quietConsole() {
  return vi.spyOn(console, 'error').mockImplementation(() => undefined);
}

function client() {
  const qc = createQueryClient();
  qc.setDefaultOptions({ queries: { retry: false, staleTime: 0, refetchOnWindowFocus: false } });
  return qc;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

describe('error boundary', () => {
  it('shows the error section instead of a broken part, and Try again renders it once more', async () => {
    const console = quietConsole();
    const user = userEvent.setup();
    let fixed = false;
    function Sometimes() {
      if (!fixed) throw new TypeError('invented render failure');
      return <p>Ekran geri geldi</p>;
    }
    render(
      <ErrorBoundary>
        <Sometimes />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('heading', { name: 'Bu ekranı gösteremedim' })).toBeInTheDocument();
    expect(screen.getByText(/TypeError: invented render failure/)).toBeInTheDocument();
    fixed = true;
    await user.click(screen.getByRole('button', { name: 'Yeniden dene' }));
    expect(screen.getByText('Ekran geri geldi')).toBeInTheDocument();
    console.mockRestore();
  });

  it('copies only the error name, message and component stack', async () => {
    const console = quietConsole();
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    function Inner() {
      return <Boom />;
    }
    render(
      <ErrorBoundary>
        <Inner />
      </ErrorBoundary>,
    );
    await user.click(screen.getByRole('button', { name: 'Hata ayrıntısını kopyala' }));
    expect(await screen.findByText('Kopyalandı')).toBeInTheDocument();
    const copied = writeText.mock.calls[0]![0] as string;
    expect(copied.startsWith('TypeError: invented render failure\n\n')).toBe(true);
    expect(copied).toContain('Inner');
    expect(copied).not.toMatch(/https?:\/\/|\.tsx?:\d/);
    console.mockRestore();
  });

  it('drops file paths from the component stack', () => {
    const detail = errorDetail(
      new RangeError('invented'),
      '\n    at Overview (http://127.0.0.1:5173/src/Overview.tsx:12:3)\n    at main\n',
    );
    expect(detail).toBe('RangeError: invented\n\n  at Overview\n  at main');
  });

  it('keeps the menu working when a screen fails, and the next screen renders', async () => {
    const console = quietConsole();
    const user = userEvent.setup();
    const api = createMockApi({ latency: 0, uploadMs: 0, analysisMs: 30 });
    render(
      <ApiProvider api={api}>
        <QueryClientProvider client={client()}>
          <ToastProvider>
            <MemoryRouter initialEntries={['/']}>
              <TourProvider>
                <AppShell>
                  <Routes>
                    <Route path="/" element={<Boom />} />
                    <Route path="/installments" element={<p>Taksit ekranı</p>} />
                  </Routes>
                </AppShell>
              </TourProvider>
            </MemoryRouter>
          </ToastProvider>
        </QueryClientProvider>
      </ApiProvider>,
    );
    expect(screen.getByRole('alert', { name: 'Bu ekranı gösteremedim' })).toBeInTheDocument();
    expect(screen.getByRole('navigation')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Taksitler' }));
    expect(await screen.findByText('Taksit ekranı')).toBeInTheDocument();
    expect(screen.queryByText('Bu ekranı gösteremedim')).not.toBeInTheDocument();
    console.mockRestore();
  });
});

describe('automatic AI run', () => {
  const mock = (preset?: 'full') => createMockApi({ latency: 0, uploadMs: 0, analysisMs: 30, preset });
  const renderWith = (api: KalanApi) => render(<App api={api} queryClient={client()} initialPath="/" />);

  it('starts the batch on open when a tool is chosen and something is left for it', async () => {
    localStorage.removeItem(AUTO_RUN_KEY);
    const api = mock('full');
    const start = vi.spyOn(api, 'startAnalysisAll');
    renderWith(api);
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    expect(localStorage.getItem(AUTO_RUN_KEY)).toBe(localDay(new Date()));
    await settle();
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('does not start twice on the same day', async () => {
    const api = mock('full');
    const start = vi.spyOn(api, 'startAnalysisAll');
    renderWith(api);
    expect(await screen.findByRole('navigation')).toBeInTheDocument();
    await settle();
    expect(start).not.toHaveBeenCalled();
  });

  it('does not try again after a failed batch', async () => {
    localStorage.removeItem(AUTO_RUN_KEY);
    const api = mock('full');
    const failed: AnalysisRun = { job_id: 'job_x', kind: 'analysis_all', status: 'failed', error: 'timeout', done: 0, total: 3 };
    vi.spyOn(api, 'getAnalysisAll').mockResolvedValue(failed);
    const start = vi.spyOn(api, 'startAnalysisAll');
    renderWith(api);
    expect(await screen.findByRole('navigation')).toBeInTheDocument();
    await settle();
    expect(start).not.toHaveBeenCalled();
  });

  it('does nothing without a chosen tool', async () => {
    localStorage.removeItem(AUTO_RUN_KEY);
    const api = mock();
    const start = vi.spyOn(api, 'startAnalysisAll');
    renderWith(api);
    expect(await screen.findByRole('navigation')).toBeInTheDocument();
    await settle();
    expect(start).not.toHaveBeenCalled();
    expect(localStorage.getItem(AUTO_RUN_KEY)).toBeNull();
  });

  it('reads what the back end reports', () => {
    const st = (analysis_status: StatementSummary['analysis_status']) => ({ analysis_status }) as StatementSummary;
    expect(hasUnreadStatement([st('done'), st('none')])).toBe(true);
    expect(hasUnreadStatement([st('done'), st('failed')])).toBe(true);
    expect(hasUnreadStatement([st('done'), st('pending')])).toBe(false);
    const tx = (category: string | null) => ({ category }) as Transaction;
    expect(hasUncategorizedRow([tx('market'), tx(null)])).toBe(true);
    expect(hasUncategorizedRow([tx('market')])).toBe(false);
    expect(batchAllowsStart(null)).toBe(true);
    expect(batchAllowsStart({ status: 'done' } as AnalysisRun)).toBe(true);
    expect(batchAllowsStart({ status: 'pending' } as AnalysisRun)).toBe(false);
    expect(batchAllowsStart({ status: 'failed' } as AnalysisRun)).toBe(false);
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  it('lets the strip notice a batch that starts after its first look', async () => {
    const api = createMockApi({ latency: 0, uploadMs: 0, analysisMs: 400, preset: 'full' });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ApiProvider api={api}>
        <QueryClientProvider client={client()}>{children}</QueryClientProvider>
      </ApiProvider>
    );
    const { result } = renderHook(() => useAnalysisRun(20, 40), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.status).not.toBe('pending');
    await api.startAnalysisAll();
    await waitFor(() => expect(result.current.data?.status).toBe('pending'));
  });
});
