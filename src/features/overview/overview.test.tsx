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

describe('overview: what you pay, card by card', () => {
  it('rings the total in the lead and names the nearest card and due date', async () => {
    renderWith('/', { preset: 'full' });
    const lead = await screen.findByText(/sıradaki ödemelerin toplam/);
    expect(text(lead.textContent)).toBe(
      '2 kartına sıradaki ödemelerin toplam 18.502,04 TL. İlki Denemebank Deneme Kart ··1111: 10 Kasım 2026 tarihine kadar 4.019,16 TL.',
    );
    expect(lead.querySelectorAll('[data-pencil="circle"]')).toHaveLength(1);
  });

  it('lists one row per card, marks a forecast with the word "tahmin" and shows the total', async () => {
    renderWith('/', { preset: 'full' });
    const table = await screen.findByRole('table', { name: 'Ödeyeceklerin' });
    // the header row is for screen readers; then two cards and the total
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(text(rows[0]!.textContent)).toContain('Denemebank Deneme Kart ··1111');
    expect(text(rows[0]!.textContent)).toContain('Ekstren geldi. Asgari ödeme 804,00 TL.');
    expect(text(rows[0]!.textContent)).not.toContain('tahmin');
    expect(text(rows[1]!.textContent)).toContain('Örnekbank Örnek Kart ··0000');
    expect(text(rows[1]!.textContent)).toContain('tahmin');
    expect(text(rows[1]!.textContent)).toContain('Son ödeme 4 Aralık 2026');
    expect(text(rows[2]!.textContent)).toBe('Toplam18.502,04 TL');
    expect(screen.getByText(/karttan çıkmadığı için toplama katmadım/)).toBeInTheDocument();
  });

  it('keeps no jargon from the old forecast on the page', async () => {
    renderWith('/', { preset: 'full' });
    await screen.findByRole('table', { name: 'Ödeyeceklerin' });
    for (const word of [/ortanca/i, /sınama/i, /Dahil/, /Hariç/, /uncategorized/]) expect(screen.queryByText(word)).not.toBeInTheDocument();
  });

  it('says so when the payments cannot be read, and the rest of the page still works', async () => {
    renderWith('/', { preset: 'full' }, { getForecast: down });
    expect(await screen.findByText('Ödemelerini alamadım. Arka uç kapalı olabilir.')).toBeInTheDocument();
    expect(await screen.findByRole('list', { name: 'Uyarılar' })).toBeInTheDocument();
  });
});

describe('overview: installments left', () => {
  it('says how much is left in how many plans and when the last one ends, from the back end summary', async () => {
    renderWith('/', { preset: 'full' });
    const sentence = await screen.findByText(/borcun kaldı/);
    expect(text(sentence.textContent)).toBe('Süren 4 taksitli harcamandan toplam 30.994,52 TL borcun kaldı. Son taksit Haziran 2027 ayında.');
    expect(screen.getByRole('link', { name: 'Taksitlere git' })).toHaveAttribute('href', '/installments');
    expect(screen.getByText(/Kasım 2026: 7.997,26/)).toBeInTheDocument();
  });
});

describe('overview: to do', () => {
  it('shows at most three things to do, critical first, and opens the rest', async () => {
    const user = userEvent.setup();
    renderWith('/', { preset: 'full' });
    const list = await screen.findByRole('list', { name: 'Uyarılar' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(text(rows[0]!.textContent)).toContain('Kritik');
    expect(text(rows[0]!.textContent)).toContain('Denemebank Deneme Kart ··1111');
    expect(text(rows[1]!.textContent)).toContain('MUZIKBOX iptalden sonra çekim yaptı');
    expect(text(rows[2]!.textContent)).toContain('Denemebank Deneme Kart ··1111: eksik ekstre');
    expect(text(rows[2]!.textContent)).toContain('Ağustos 2026 ekstresi yok.');

    await user.click(screen.getByRole('button', { name: /tane daha göster/ }));
    expect(within(list).getAllByRole('listitem').length).toBeGreaterThan(3);
    expect(within(list).getByText('STREAMFLIX ücreti arttı')).toBeInTheDocument();
  });

  it('handles an alert list that will not load', async () => {
    renderWith('/', { preset: 'full' }, { getAlerts: down });
    expect(await screen.findByText('Uyarıları alamadım.')).toBeInTheDocument();
  });
});

describe('overview: savings and where the money goes', () => {
  it('lists the rule suggestions with what to do and the monthly saving the back end computed', async () => {
    renderWith('/', { preset: 'full' });
    const list = await screen.findByRole('list', { name: 'Tasarruf önerileri' });
    const first = within(list).getAllByRole('listitem')[0]!;
    expect(text(first.textContent)).toContain('MIGROS-ORNEK için ayda ortalama 1.940,33 TL harcıyorsun');
    expect(text(first.textContent)).toContain('Ayda 970,17 TL kalır');
    expect(within(first).getByRole('link', { name: 'Harcamalar' })).toHaveAttribute('href', '/spending?merchant=MIGROS-ORNEK');
    expect(within(list).getByText(/kartında faiz ödüyorsun/)).toBeInTheDocument();
  });

  it('writes Spanish suggestions on this side from kind and params', async () => {
    const base = createMockApi({ latency: 0, preset: 'full' });
    renderWith('/', { preset: 'full' }, { getSettings: async () => ({ ...(await base.getSettings()), locale: 'es' }) });
    const list = await screen.findByRole('list', { name: 'Formas de ahorrar' });
    expect(within(list).getByText(/Gastas .* al mes en MIGROS-ORNEK/)).toBeInTheDocument();
  });

  it('shows the five biggest categories of the latest month as bars with amounts', async () => {
    renderWith('/', { preset: 'full' });
    const list = await screen.findByRole('list', { name: 'Paran nereye gidiyor' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(5);
    expect(text(rows[0]!.textContent)).toBe('Market4.584,51 TL');
    const region = screen.getByRole('region', { name: 'Paran nereye gidiyor' });
    expect(text(region.textContent)).toContain('Ekim 2026 ayında 19.669,80 TL harcadın. En çok Market: 4.584,51 TL.');
  });

  it('invites to connect an AI tool in one line when none is chosen', async () => {
    renderWith('/', { preset: 'basic' });
    expect(await screen.findByText(/Bilgisayarındaki yapay zekâ aracını bağlarsan/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Aracı bağla' })).toHaveAttribute('href', '/settings');
  });
});

describe('overview: first run', () => {
  it('leads a first run to the statements and the AI tool choice', async () => {
    renderWith('/', { preset: 'empty' });
    const steps = await screen.findByRole('list', { name: 'Başlangıç adımları' });
    expect(within(steps).getAllByRole('listitem')).toHaveLength(2);
    expect(within(steps).getByRole('link', { name: 'Ekstre yükle' })).toHaveAttribute('href', '/statements');
    expect(within(steps).getByRole('link', { name: 'Araç seç' })).toHaveAttribute('href', '/settings');
    await waitFor(() => expect(screen.queryByRole('table', { name: 'Ödeyeceklerin' })).not.toBeInTheDocument());
  });
});
