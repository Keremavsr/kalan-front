import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../test/render';
import { NBSP } from '../lib/format';

const text = (s: string | null | undefined) => (s ?? '').split(NBSP).join(' ');

describe('installments: plain sentences and "I paid this off"', () => {
  it('says each plan in a sentence with its card', async () => {
    await renderApp('/installments', { preset: 'full' });
    const table = await screen.findByRole('table', { name: 'Ödeme planı' });
    const row = within(table).getByText('MOBILYA-ORNEK KITAPLIK').closest('tr')!;
    expect(text(row.textContent)).toContain('Örnekbank Örnek Kart ··0000');
    expect(text(row.textContent)).toContain('6 taksitten 2 tanesi ödendi, 4 tanesi kaldı. Sıradaki: Kasım 2026, 1.500,00 TL.');
  });

  it('closes a plan after asking, lists it faded at the bottom and opens it again', async () => {
    const user = userEvent.setup();
    const { api } = await renderApp('/installments', { preset: 'full' });
    await user.click(await screen.findByRole('button', { name: 'ORNEK GIYIM planını kapattım' }));
    const dialog = await screen.findByRole('dialog', { name: 'Bu taksiti kapattın mı?' });
    await user.click(within(dialog).getByRole('button', { name: 'Kapattım' }));
    expect(await screen.findByText('ORNEK GIYIM kapandı; toplamlardan çıkardım.')).toBeInTheDocument();

    const closed = await screen.findByRole('list', { name: 'Kapanan taksitler' });
    await waitFor(() => expect(within(closed).getByText('ORNEK GIYIM')).toBeInTheDocument());
    expect((await api.getSchedule(12)).summary).toMatchObject({ plan_count: 3 });
    // The statement-closed plan says so and cannot be undone here.
    expect(within(closed).getByText(/Ekstrede kapanmış/)).toBeInTheDocument();

    await user.click(within(closed).getByRole('button', { name: 'ORNEK GIYIM planını yeniden aç' }));
    expect(await screen.findByText('ORNEK GIYIM yeniden açıldı.')).toBeInTheDocument();
    expect((await api.getSchedule(12)).summary).toMatchObject({ plan_count: 4 });
  });

  it('narrows the plan rows to one card and drops the all-card totals row', async () => {
    const user = userEvent.setup();
    await renderApp('/installments', { preset: 'full' });
    await user.selectOptions(await screen.findByLabelText('Kart'), 'Denemebank Deneme Kart ··1111');
    const table = screen.getByRole('table', { name: 'Ödeme planı' });
    expect(within(table).getByText('ORNEK GIYIM')).toBeInTheDocument();
    expect(within(table).queryByText('MOBILYA-ORNEK KITAPLIK')).not.toBeInTheDocument();
    expect(screen.queryByText('Aylık toplam')).not.toBeInTheDocument();
  });
});

describe('recurring: subscriptions and bills', () => {
  it('splits subscriptions from bills and takes a new amount for a subscription', async () => {
    const user = userEvent.setup();
    await renderApp('/recurring', { preset: 'full' });
    const subs = await screen.findByRole('list', { name: 'Düzenli ödemeler' });
    const bills = screen.getByRole('list', { name: 'Faturalar' });
    expect(within(bills).getByText('ORNEK ELEKTRIK')).toBeInTheDocument();
    expect(within(subs).queryByText('ORNEK ELEKTRIK')).not.toBeInTheDocument();
    expect(within(bills).queryByRole('button', { name: /Tutar değişti|İptal ettim/ })).not.toBeInTheDocument();

    await user.click(within(subs).getByRole('button', { name: 'STREAMFLIX için yeni tutarı yaz' }));
    const dialog = await screen.findByRole('dialog', { name: 'STREAMFLIX tutarı değişti' });
    await user.type(within(dialog).getByLabelText('Yeni aylık tutar'), 'abc');
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
    expect(within(dialog).getByText('Tutarı 1.234,56 biçiminde yaz.')).toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText('Yeni aylık tutar'));
    await user.type(within(dialog).getByLabelText('Yeni aylık tutar'), '99,99');
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
    expect(await screen.findByText('STREAMFLIX için yeni tutarı kaydettim.')).toBeInTheDocument();
    const row = within(subs).getByText('STREAMFLIX').closest('li')!;
    await waitFor(() => expect(text(row.textContent)).toContain('99,99 TL'));
    expect(text(row.textContent)).toContain('senin yazdığın tutar');

    await user.click(within(row).getByRole('button', { name: 'STREAMFLIX için yazdığın tutarı kaldır' }));
    await waitFor(() => expect(text(row.textContent)).toContain('179,99 TL'));
  });
});

describe('settings: cards and the AI tool', () => {
  it('names a card and shows the name on other screens', async () => {
    const user = userEvent.setup();
    await renderApp('/settings', { preset: 'full' });
    const list = await screen.findByRole('list', { name: 'Kartların' });
    const field = within(list).getAllByLabelText('Kartın adı')[0]!;
    await user.type(field, 'Market kartım');
    await user.click(within(list).getAllByRole('button', { name: 'Kaydet' })[0]!);
    expect(await screen.findByText('Artık Market kartım ··1111 diye gösteriyorum.')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Özet' }));
    expect(await screen.findAllByText(/Market kartım ··1111/)).not.toHaveLength(0);
  });
});

describe('spending: uncategorised rows and cards', () => {
  it('counts uncategorised rows, shows them and hands them to the AI tool', async () => {
    const user = userEvent.setup();
    await renderApp('/spending/2026-09', { preset: 'full' });
    expect(await screen.findByText('Kategorisiz 1 işlem var.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Göster' }));
    expect(screen.getByText('ORNEK KIRTASIYE')).toBeInTheDocument();
    expect(screen.queryByText('uncategorized')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Yapay zekâya ayırt' }));
    expect(await screen.findByText(/Kategorisiz işlemleri araca gönderdim/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Kategorisiz 1 işlem var.')).not.toBeInTheDocument(), { timeout: 4000 });
  });

  it('shows the card on each row and filters by card', async () => {
    const user = userEvent.setup();
    await renderApp('/spending/2026-10', { preset: 'full' });
    const table = await screen.findByRole('table', { name: 'İşlemler' });
    expect(within(table).getAllByText('Denemebank Deneme Kart ··1111').length).toBeGreaterThan(0);
    await user.selectOptions(await screen.findByLabelText('Kart'), 'Denemebank Deneme Kart ··1111');
    expect(within(table).queryByText('Örnekbank Örnek Kart ··0000')).not.toBeInTheDocument();
  });

  it('opens with a merchant search from a suggestion link', async () => {
    await renderApp('/spending?merchant=ORNEK%20YEMEK', { preset: 'full' });
    expect(await screen.findByLabelText('Ara')).toHaveValue('ORNEK YEMEK');
    expect(screen.getByRole('list', { name: 'Sık harcadığın yerler' })).toBeInTheDocument();
  });
});

describe('statements: missing months', () => {
  it('names the card and the missing months in a plain sentence at the top', async () => {
    await renderApp('/statements', { preset: 'full' });
    const block = await screen.findByRole('region', { name: 'Bir ekstre eksik' });
    expect(text(block.textContent)).toContain('Denemebank Deneme Kart ··1111 için Ağustos 2026 ekstresi yok.');
    expect(text(block.textContent)).toContain('Bankanın uygulamasından');
  });
});
