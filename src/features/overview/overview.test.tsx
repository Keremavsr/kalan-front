import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App, createQueryClient } from '../../App';
import { createMockApi, type MockOptions } from '../../api/mock';
import { ApiError, type KalanApi } from '../../api/types';
import { NBSP } from '../../lib/format';

const text = (s: string | null | undefined) => (s ?? '').split(NBSP).join(' ');

/** Renders the app on the mock; `patch` swaps single API calls (to fail them, for example). */
function renderWith(path: string, options: MockOptions = {}, patch: Partial<KalanApi> = {}) {
  const api: KalanApi = { ...createMockApi({ latency: 0, uploadMs: 0, analysisMs: 30, ...options }), ...patch };
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false, staleTime: 0, refetchOnWindowFocus: false } });
  render(<App api={api} queryClient={queryClient} initialPath={path} />);
  return api;
}

const down = () => Promise.reject(new ApiError(503, 'unavailable', 'back end is off'));

describe('overview: next statement forecast', () => {
  it('rings the forecast in the lead and lists the parts the back end returned', async () => {
    renderWith('/', { preset: 'full' });
    const lead = await screen.findByText(/ekstren için tahminim/);
    await waitFor(() => expect(text(lead.textContent)).toContain('48.522,87 TL'));
    expect(text(lead.textContent)).toBe('Kasım 2026 ekstren için tahminim 48.522,87 TL. Bunun 10.497,26 TL kadarı şimdiden taksit olarak belli.');
    expect(lead.querySelectorAll('[data-pencil="circle"]')).toHaveLength(1);

    const section = screen.getByRole('region', { name: 'Gelecek ekstre' });
    for (const label of ['Taksitler', 'Abonelikler', 'Değişken harcama', 'Sabit giderler']) {
      expect(within(section).getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(within(section).getByText(/STREAMFLIX, MUZIKBOX, BULUTDEPO/)).toBeInTheDocument();
    // Honest backtest line: how far off it was and in which direction.
    expect(text(within(section).getByText(/sınadım/).textContent)).toBe(
      'Bu yöntemi geçmişteki 1 ayda sınadım: tahmin ortalama 5.940,80 TL saptı (yüzde 33), çoğunlukla düşük kaldı. Ay ay sınama',
    );
  });

  it('asks the back end again when fixed costs are left out', async () => {
    const user = userEvent.setup();
    const calls: boolean[] = [];
    const base = createMockApi({ latency: 0, preset: 'full' });
    renderWith('/', { preset: 'full' }, {
      getForecast: (includeFixed?: boolean) => {
        calls.push(includeFixed ?? true);
        return base.getForecast(includeFixed);
      },
    });
    const lead = await screen.findByText(/ekstren için tahminim/);
    await user.click(screen.getByLabelText('Hariç'));
    await waitFor(() => expect(text(lead.textContent)).toContain('17.982,88 TL'));
    expect(calls).toContain(false);
    expect(screen.getByText('Toplama katmadım')).toBeInTheDocument();
  });

  it('shows the months behind the backtest on request', async () => {
    const user = userEvent.setup();
    renderWith('/', { preset: 'full' });
    await user.click(await screen.findByRole('button', { name: 'Ay ay sınama' }));
    const table = await screen.findByRole('table', { name: /kendinden önceki verilerle/ });
    expect(text(within(table).getByText('Ekim 2026').closest('tr')?.textContent)).toContain('-5.940,80');
  });

  it('says so when the forecast cannot be read, and the rest of the page still works', async () => {
    renderWith('/', { preset: 'full' }, { getForecast: down });
    expect(await screen.findByText('Tahmini alamadım. Arka uç kapalı olabilir.')).toBeInTheDocument();
    expect(await screen.findByRole('list', { name: 'Uyarılar' })).toBeInTheDocument();
  });
});

describe('overview: alerts', () => {
  it('marks critical rows with the word and keeps notes folded', async () => {
    const user = userEvent.setup();
    renderWith('/', { preset: 'full' });
    const list = await screen.findByRole('list', { name: 'Uyarılar' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(4);
    expect(text(rows[0]!.textContent)).toContain('Kritik');
    expect(text(rows[0]!.textContent)).toContain('Ekstre borcu 2.484,56 TL, asgari ödeme 497,00 TL.');
    expect(text(rows[1]!.textContent)).toContain('MUZIKBOX iptalden sonra çekim yaptı');
    expect(text(rows[2]!.textContent)).toContain('Limitin dolmak üzere');
    expect(text(rows[2]!.textContent)).not.toContain('Kritik');
    expect(within(list).getAllByText('Kritik')).toHaveLength(2);
    expect(within(rows[1]!).getByRole('link', { name: 'Düzenli ödemeler' })).toHaveAttribute('href', '/recurring');

    await user.click(screen.getByRole('button', { name: '6 bilgi notunu da göster' }));
    expect(within(list).getAllByRole('listitem')).toHaveLength(10);
    expect(within(list).getByText('STREAMFLIX ücreti arttı')).toBeInTheDocument();
    expect(within(list).getAllByRole('link', { name: 'Haklarım' })[0]).toHaveAttribute('href', '/rights');
  });

  it('handles an alert list that will not load', async () => {
    renderWith('/', { preset: 'full' }, { getAlerts: down });
    expect(await screen.findByText('Uyarıları alamadım.')).toBeInTheDocument();
  });
});

describe('overview: installment strip and first run', () => {
  it('sums up the next 12 months in one sentence and links to installments', async () => {
    renderWith('/', { preset: 'full' });
    const sentence = await screen.findByText(/Önümüzdeki 12 ayın/);
    expect(text(sentence.textContent)).toBe('Önümüzdeki 12 ayın 8 ayında taksit var. En yüksek ay Kasım 2026, 10.497,26 TL.');
    expect(screen.getByRole('link', { name: 'Taksitlere git' })).toHaveAttribute('href', '/installments');
  });

  it('leads a first run to the statements and the AI tool choice', async () => {
    renderWith('/', { preset: 'empty' });
    const steps = await screen.findByRole('list', { name: 'Başlangıç adımları' });
    expect(within(steps).getAllByRole('listitem')).toHaveLength(2);
    expect(within(steps).getByRole('link', { name: 'Ekstre yükle' })).toHaveAttribute('href', '/statements');
    expect(within(steps).getByRole('link', { name: 'Araç seç' })).toHaveAttribute('href', '/settings');
    expect(screen.queryByRole('region', { name: 'Gelecek ekstre' })).not.toBeInTheDocument();
  });
});
