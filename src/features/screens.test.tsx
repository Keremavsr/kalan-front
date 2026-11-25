import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../test/render';
import { NBSP } from '../lib/format';

const pdf = () => new File(['%PDF-1.4 invented'], 'ekstre-ekim.pdf', { type: 'application/pdf' });
const text = (s: string | null | undefined) => (s ?? '').split(NBSP).join(' ');

describe('upload', () => {
  it('shows the parse result and explains a mismatch in plain words', async () => {
    const user = userEvent.setup();
    await renderApp('/upload');
    await user.upload(await screen.findByLabelText('Dosya seçin'), pdf());

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Toplamlar tutmuyor')).toBeInTheDocument();
    expect(text(alert.textContent)).toContain('Aradaki fark 149,99 TL');
    expect(text(alert.textContent)).toContain('bankanın işlem listesiyle karşılaştırın');
    expect(screen.getByText('Okunan ekstre')).toBeInTheDocument();
    expect(text(screen.getByText('•••• 0000').textContent)).toBe('•••• 0000');
  });

  it('refuses a non-PDF file without calling the back end', async () => {
    const user = userEvent.setup({ applyAccept: false });
    await renderApp('/upload');
    await user.upload(await screen.findByLabelText('Dosya seçin'), new File(['x'], 'notlar.txt', { type: 'text/plain' }));
    expect(await screen.findByText('Yalnızca PDF dosyası yüklenebilir.')).toBeInTheDocument();
  });
});

describe('installment calendar', () => {
  it('states the committed future and shows the cash advance parts', async () => {
    await renderApp('/', { uploaded: true });

    const header = await screen.findByText(/şimdiden/);
    await waitFor(() => expect(text(header.textContent)).toContain('28.994,52 TL'));
    expect(text(header.textContent)).toBe(
      'Önümüzdeki 12 ay için şimdiden 28.994,52 TL taksit ödemesi var. En yüksek ay Kasım 2026: 6.997,26 TL. Ocak 2027 ve sonrasında ayda en fazla 3.500,00 TL.',
    );
    expect(screen.getByRole('heading', { name: 'Nakit avans taksitinin içeriği' })).toBeInTheDocument();
    expect(screen.getByText('BSMV')).toBeInTheDocument();
    expect(screen.getByText('KKDF')).toBeInTheDocument();
  });

  it('switches to 6 months', async () => {
    const user = userEvent.setup();
    await renderApp('/');
    await screen.findByText(/şimdiden/);
    await user.click(screen.getByLabelText('6 ay'));
    await waitFor(() => expect(screen.getByText(/Önümüzdeki 6 ay/)).toBeInTheDocument());
  });
});

describe('manual entry', () => {
  it('validates fields, then adds an installment plan', async () => {
    const user = userEvent.setup();
    await renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'Harcama ekle' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Ekle' }));
    expect(within(dialog).getAllByText('Bu alan gerekli.')).toHaveLength(2);

    await user.type(within(dialog).getByLabelText('Açıklama'), 'TELEFON-ORNEK');
    await user.type(within(dialog).getByLabelText('Toplam tutar'), 'on bin');
    await user.click(within(dialog).getByRole('button', { name: 'Ekle' }));
    expect(within(dialog).getByText('Tutarı rakamla yazın, örnek 1.149,50.')).toBeInTheDocument();

    await user.clear(within(dialog).getByLabelText('Toplam tutar'));
    await user.type(within(dialog).getByLabelText('Toplam tutar'), '12.000');
    await user.selectOptions(within(dialog).getByLabelText('Taksit'), '6');
    expect(text(within(dialog).getByText(/Taksit başına/).textContent)).toBe('Taksit başına 2.000,00 TL');
    await user.click(within(dialog).getByRole('button', { name: 'Ekle' }));

    expect(await screen.findByText('6 taksitli harcama eklendi ve takvime işlendi.')).toBeInTheDocument();
    expect(await screen.findAllByText('TELEFON-ORNEK')).not.toHaveLength(0);
  });
});

describe('month', () => {
  it('shows the change against the previous month and filters transactions', async () => {
    const user = userEvent.setup();
    await renderApp('/month/2026-09');
    const lead = await screen.findByText(/ekstresinde/);
    expect(text(lead.textContent)).toContain('7.683,17 TL');
    expect(text(screen.getByText(/Bir önceki ay/).textContent)).toContain('9.415,63 TL');

    expect(await screen.findByText('11 / 11 işlem')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Ara'), 'migros');
    expect(screen.getByText('1 / 11 işlem')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Filtreleri temizle' }));
    await user.selectOptions(screen.getByLabelText('Tür'), 'installment');
    expect(screen.getByText('2 / 11 işlem')).toBeInTheDocument();
  });
});

describe('subscriptions', () => {
  it('lists recurring charges and the price rise', async () => {
    await renderApp('/subscriptions', { uploaded: true });
    const row = (await screen.findByRole('rowheader', { name: 'STREAMFLIX' })).closest('tr')!;
    expect(text(row.textContent)).toContain('+%20');
    expect(text(row.textContent)).toContain('yılda +360,00 TL');
    expect(text(screen.getByText(/Fiyatı artan/).textContent)).toContain('Fiyatı artan: STREAMFLIX (+%20).');
  });
});

describe('setup and watch items', () => {
  it('shows which providers exist, then analyses a statement with a pending state', async () => {
    const user = userEvent.setup();
    await renderApp('/setup', { analysisMs: 60, uploaded: true });

    const claude = await screen.findByRole('radio', { name: /Claude Code/ });
    expect(screen.getByRole('radio', { name: /Gemini CLI/ })).toBeDisabled();
    expect(screen.getAllByText('Bu bilgisayarda bulundu')).toHaveLength(2);
    await user.click(claude);
    expect(await screen.findByText('Claude Code seçildi.')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Dikkat edilecekler' }));
    await user.click(await screen.findByRole('button', { name: 'Yorumla' }));
    expect(await screen.findByText(/Yorum hazırlanıyor/)).toBeInTheDocument();
    expect(await screen.findByText('Nakit avansın iki taksiti kaldı', {}, { timeout: 4000 })).toBeInTheDocument();
    const link = screen.getAllByRole('link', { name: /STREAMFLIX/ })[0]!;
    expect(link).toHaveAttribute('href', '/month/2026-10?tx=tx_10_03');
  });

  it('switches the interface to English', async () => {
    const user = userEvent.setup();
    await renderApp('/setup');
    await user.click(await screen.findByLabelText('English'));
    expect(await screen.findByRole('heading', { name: 'Setup' })).toBeInTheDocument();
    expect(text(screen.getByText(/Amounts and dates look like this/).textContent)).toContain('TRY 1,149.50');
  });
});
