import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App, createQueryClient } from '../../App';
import { createMockApi, type MockOptions } from '../../api/mock';
import { ApiError, type KalanApi, type ShareCardQuery, type SimulationRequest } from '../../api/types';
import { NBSP } from '../../lib/format';

const text = (s: string | null | undefined) => (s ?? '').split(NBSP).join(' ');

function renderWith(path: string, options: MockOptions = {}, patch: Partial<KalanApi> = {}) {
  const api: KalanApi = { ...createMockApi({ latency: 0, uploadMs: 0, analysisMs: 30, ...options }), ...patch };
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false, staleTime: 0, refetchOnWindowFocus: false } });
  render(<App api={api} queryClient={queryClient} initialPath={path} />);
  return api;
}

describe('installments: cash advance', () => {
  it('splits the remaining total, not one month, and shows the coming month next to it', async () => {
    renderWith('/installments', { preset: 'full' });
    const card = within((await screen.findByRole('heading', { name: 'Nakit avans taksitinin içeriği' })).closest('section')!);
    expect(text(card.getByText(/Kalan 2 taksitin toplamı/).textContent)).toBe(
      'Kalan 2 taksitin toplamı 6.994,52 TL. Bunun 6.000,00 TL kadarı anapara; gerisi faiz, BSMV ve KKDF.',
    );
    const table = card.getByRole('table');
    const principal = within(table).getByText('Anapara').closest('tr')!;
    // Coming month 3.000,00 TL, remaining total 6.000,00 TL: two different numbers from two different fields.
    expect(text(principal.textContent)).toContain('3.000,00 TL');
    expect(text(principal.textContent)).toContain('6.000,00 TL');
    expect(within(table).getByText('Kasım 2026 taksiti')).toBeInTheDocument();
  });
});

describe('installments: what if I buy', () => {
  it('validates, then draws the purchase on top of the current load', async () => {
    const user = userEvent.setup();
    const bodies: SimulationRequest[] = [];
    const base = createMockApi({ latency: 0, preset: 'full' });
    renderWith('/installments', { preset: 'full' }, {
      simulateInstallment: (body) => {
        bodies.push(body);
        return base.simulateInstallment(body);
      },
    });
    const amount = await screen.findByLabelText('Tutar');
    await user.click(screen.getByRole('button', { name: 'Grafikte göster' }));
    expect(screen.getByText('Tutarı 1.234,56 biçiminde yaz.')).toBeInTheDocument();
    expect(bodies).toHaveLength(0);

    await user.type(amount, '1.234,56');
    await user.type(screen.getByLabelText('Aylık faiz, yüzde'), '3,11');
    await user.click(screen.getByRole('button', { name: 'Grafikte göster' }));

    const result = await screen.findByText(/Bu alışveriş/);
    expect(bodies[0]).toEqual({ amount: 123456, count: 6, start_month: '2026-11', interest_monthly: '3.11', months: 12 });
    expect(text(result.textContent)).toBe(
      'Bu alışveriş Kasım 2026 ile Nisan 2027 arasında ayda 228,73 TL ekler. En yüksek ay yine Kasım 2026; toplamı 10.497,26 TL yerine 10.725,99 TL olur.',
    );
    expect(screen.getByText(/Faizle toplam/).textContent?.split(NBSP).join(' ')).toBe('Faizle toplam 1.372,37 TL ödersin; bunun 137,81 TL kadarı faiz.');
    expect(document.querySelectorAll('[data-sim-slice]')).toHaveLength(6);
    expect(screen.getByText('Alırsam: yeni alışveriş')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Kaldır' }));
    await waitFor(() => expect(document.querySelectorAll('[data-sim-slice]')).toHaveLength(0));
  });

  it('shows the back end refusal in words', async () => {
    const user = userEvent.setup();
    renderWith('/installments', { preset: 'full' }, {
      simulateInstallment: () => Promise.reject(new ApiError(422, 'invalid_installment', 'count must be 2 or more')),
    });
    await user.type(await screen.findByLabelText('Tutar'), '100');
    await user.click(screen.getByRole('button', { name: 'Grafikte göster' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Hesaplayamadım: count must be 2 or more');
  });
});

describe('installments: early payoff', () => {
  it('opens from the plan row, lets me pick the month and says the bank discount is unknown', async () => {
    const user = userEvent.setup();
    renderWith('/installments', { preset: 'full' });
    await user.click(await screen.findByRole('button', { name: 'Mobil taksitli nakit avans planını erken kapatırsam' }));
    const dialog = await screen.findByRole('dialog', { name: 'Mobil taksitli nakit avans: erken kapatma' });
    const lead = await within(dialog).findByText(/ekstresinde kalan 2/);
    expect(text(lead.textContent)).toBe('Kasım 2026 ekstresinde kalan 2 taksiti birlikte ödersen o ay bu plan için 6.994,52 TL ödersin.');
    expect(text(within(dialog).getByText(/Banka gelecek ayların/).textContent)).toBe(
      'Banka gelecek ayların faizini, BSMV ve KKDF’yi düşerse ödeyeceğin 6.000,00 TL olur; aradaki fark 994,52 TL.',
    );
    expect(within(dialog).getByText(/erken kapama indirimini bilmiyorum/)).toBeInTheDocument();
    expect(within(dialog).getByRole('table', { name: 'Aylık toplama etkisi' })).toBeInTheDocument();

    await user.selectOptions(within(dialog).getByLabelText('Kapatacağım ay'), '2027-01');
    expect(await within(dialog).findByText('Bu planın Ocak 2027 ve sonrasında taksiti kalmıyor.')).toBeInTheDocument();
  });

  it('explains a month outside the schedule', async () => {
    const user = userEvent.setup();
    renderWith('/installments', { preset: 'full' }, {
      getEarlyPayoff: () => Promise.reject(new ApiError(422, 'month_outside_schedule', 'month outside')),
    });
    await user.click(await screen.findByRole('button', { name: 'ORNEK GIYIM planını erken kapatırsam' }));
    expect(await screen.findByText('Bu ay planın gösterilen süresinin dışında. Başka bir ay seç.')).toBeInTheDocument();
  });

  it('marks plans a statement already closed early', async () => {
    const base = createMockApi({ latency: 0, preset: 'full' });
    renderWith('/installments', { preset: 'full' }, {
      getEarlyPayoffOverview: async () => ({
        ...(await base.getEarlyPayoffOverview()),
        closed_early: [
          { plan_id: 'pl_03', statement_id: 'st_10', month: '2026-10', transaction_id: 'tx_10_01', index: 2, total_count: 6 },
          { plan_id: 'pl_gone', statement_id: 'st_09', month: '2026-09', transaction_id: 'tx_09_02', index: 3, total_count: 9 },
        ],
      }),
    });
    expect(await screen.findByText('Erken kapandı')).toBeInTheDocument();
    expect(screen.getByText('Eylül 2026 ekstresinde, 3/9. taksitte kapandı.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'İşleme git' })).toHaveAttribute('href', '/spending/2026-09?tx=tx_09_02');
  });
});

describe('installments: which card and the shareable card', () => {
  it('ranks the cards by interest-free days and spells out the assumptions', async () => {
    renderWith('/installments', { preset: 'full' });
    const list = await screen.findByRole('list', { name: 'Kartlar' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(text(rows[0]!.textContent)).toContain('31 gün faizsiz');
    expect(text(rows[0]!.textContent)).toContain('En uzun süre');
    expect(text(rows[0]!.textContent)).toContain('Sonraki kesim ekstrede yazmıyor');
    expect(text(rows[1]!.textContent)).toContain('25 gün faizsiz');
    expect(screen.getByText('Ekstrede sonraki kesim yazmıyorsa kesimi her ay aynı gün sayıyorum.')).toBeInTheDocument();
  });

  it('keeps amounts off the card until I turn them on', async () => {
    const user = userEvent.setup();
    const queries: ShareCardQuery[] = [];
    const base = createMockApi({ latency: 0, preset: 'full' });
    renderWith('/installments', { preset: 'full' }, {
      getShareCard: (q) => {
        queries.push(q ?? {});
        return base.getShareCard(q);
      },
    });
    const img = await screen.findByRole('img', { name: /Önümüzdeki 12 ayın 8 ayında taksit var/ });
    expect(img.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    expect(queries[0]).toEqual({ locale: 'tr', amounts: false });
    await user.click(screen.getByLabelText('Görünür'));
    await waitFor(() => expect(queries.at(-1)).toEqual({ locale: 'tr', amounts: true }));
    expect(screen.getByRole('button', { name: 'PNG kaydet' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'SVG kaydet' })).toBeEnabled();
  });
});
