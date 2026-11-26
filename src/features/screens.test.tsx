import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../test/render';
import { NBSP } from '../lib/format';

const pdf = () => new File(['%PDF-1.4 invented'], 'ekstre-ekim.pdf', { type: 'application/pdf' });
const text = (s: string | null | undefined) => (s ?? '').split(NBSP).join(' ');

describe('statements', () => {
  it('shows the parse result and explains a mismatch in plain words', async () => {
    const user = userEvent.setup();
    await renderApp('/statements');
    await user.upload(await screen.findByLabelText('Dosya seç'), pdf());

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Toplamlar tutmuyor')).toBeInTheDocument();
    expect(text(alert.textContent)).toContain('Aradaki fark 149,99 TL');
    expect(text(alert.textContent)).toContain('bankanın işlem listesiyle karşılaştır');
    expect(screen.getByText('Okuduğum ekstre')).toBeInTheDocument();
    expect(text(screen.getAllByText('•••• 0000')[0]!.textContent)).toBe('•••• 0000');
    // The uploaded statement joins the list below, marked by the pencil because its totals differ.
    const list = await screen.findByRole('list', { name: 'Yüklenen ekstreler' });
    expect(text(list.textContent)).toContain('Toplamlar tutmuyor');
  });

  it('refuses a non-PDF file without calling the back end', async () => {
    const user = userEvent.setup({ applyAccept: false });
    await renderApp('/statements');
    await user.upload(await screen.findByLabelText('Dosya seç'), new File(['x'], 'notlar.txt', { type: 'text/plain' }));
    expect(await screen.findByText('Yalnız PDF dosyası yükleyebilirsin.')).toBeInTheDocument();
  });
});

describe('installments', () => {
  it('states the committed future and shows the cash advance parts', async () => {
    await renderApp('/installments', { uploaded: true });

    const header = await screen.findByText(/şimdiden/);
    await waitFor(() => expect(text(header.textContent)).toContain('28.994,52 TL'));
    expect(text(header.textContent)).toBe(
      'Önümüzdeki 12 ay için şimdiden 28.994,52 TL taksit ödemesi var. En yüksek ay Kasım 2026: 6.997,26 TL. Ocak 2027 ve sonrasında ayda en fazla 3.500,00 TL.',
    );
    // The figure the screen is about is ringed by the pencil, once.
    expect(header.querySelectorAll('[data-pencil="circle"]')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Nakit avans taksitinin içeriği' })).toBeInTheDocument();
    expect(screen.getByText('BSMV')).toBeInTheDocument();
    expect(screen.getByText('KKDF')).toBeInTheDocument();
  });

  it('switches to 6 months', async () => {
    const user = userEvent.setup();
    await renderApp('/installments');
    await screen.findByText(/şimdiden/);
    await user.click(screen.getByLabelText('6 ay'));
    await waitFor(() => expect(screen.getByText(/Önümüzdeki 6 ay/)).toBeInTheDocument());
  });
});

describe('manual entry', () => {
  it('validates fields, then adds an installment plan', async () => {
    const user = userEvent.setup();
    await renderApp('/installments');
    await user.click(await screen.findByRole('button', { name: 'Harcama ekle' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Ekle' }));
    expect(within(dialog).getAllByText('Bu alan gerekli.')).toHaveLength(2);

    await user.type(within(dialog).getByLabelText('Açıklama'), 'TELEFON-ORNEK');
    await user.type(within(dialog).getByLabelText('Toplam tutar'), 'on bin');
    await user.click(within(dialog).getByRole('button', { name: 'Ekle' }));
    expect(within(dialog).getByText('Tutarı rakamla yaz, örnek 1.234,56.')).toBeInTheDocument();

    await user.clear(within(dialog).getByLabelText('Toplam tutar'));
    await user.type(within(dialog).getByLabelText('Toplam tutar'), '12.000');
    await user.selectOptions(within(dialog).getByLabelText('Taksit'), '6');
    expect(text(within(dialog).getByText(/Taksit başına/).textContent)).toBe('Taksit başına 2.000,00 TL');
    await user.click(within(dialog).getByRole('button', { name: 'Ekle' }));

    expect(await screen.findByText('6 taksitli harcama eklendi ve taksitlere işlendi.')).toBeInTheDocument();
    expect(await screen.findAllByText('TELEFON-ORNEK')).not.toHaveLength(0);
  });
});

describe('spending', () => {
  it('shows the change against the previous month and filters transactions', async () => {
    const user = userEvent.setup();
    await renderApp('/spending/2026-09');
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

  it('moves an old v0.1 link to the new screen', async () => {
    await renderApp('/month/2026-09');
    expect(await screen.findByText(/ekstresinde/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Harcamalar' })).toBeInTheDocument();
  });
});

// The recurring screen's test lives in recurring/recurring.test.tsx.

describe('settings and overview', () => {
  it('shows which providers exist; choosing one reads every statement, and the commentary sits in the statement detail', async () => {
    const user = userEvent.setup();
    await renderApp('/settings', { analysisMs: 60, uploaded: true });

    const claude = await screen.findByRole('radio', { name: /Claude Code/ });
    expect(screen.getByRole('radio', { name: /Gemini CLI/ })).toBeDisabled();
    expect(screen.getAllByText('Bu bilgisayarda bulundu')).toHaveLength(2);
    await user.click(claude);
    expect(await screen.findByText('Claude Code seçildi.')).toBeInTheDocument();
    expect(screen.getByText(/Claude Code seçili. Ekstrelerini sırayla okur/)).toBeInTheDocument();
    expect(await screen.findByText(/Claude Code ekstrelerini okuyor: \d\/\d/)).toBeInTheDocument();
    expect(await screen.findByText('Kategoriler ve öneriler yenilendi.', {}, { timeout: 4000 })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Ekstreler' }));
    const list = await screen.findByRole('list', { name: 'Yüklenen ekstreler' });
    await user.click(within(list).getAllByRole('link')[0]!);
    expect(await screen.findByText('Nakit avansın iki taksiti kaldı', {}, { timeout: 4000 })).toBeInTheDocument();
    const link = screen.getAllByRole('link', { name: /STREAMFLIX/ })[0]!;
    expect(link).toHaveAttribute('href', '/spending/2026-10?tx=tx_10_03');
    expect(screen.getByRole('button', { name: 'Yeniden yorumla' })).toBeInTheDocument();
  });

  it('says plainly when a month has no statement', async () => {
    await renderApp('/spending/2027-01');
    expect(await screen.findByRole('heading', { name: 'Bu ay boş' })).toBeInTheDocument();
    expect(screen.getByText('Bu ay için yüklenmiş ekstre yok.')).toBeInTheDocument();
  });

  it('switches the interface to English', async () => {
    const user = userEvent.setup();
    await renderApp('/settings');
    await user.click(await screen.findByLabelText('English'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    expect(text(screen.getByText(/Amounts and dates look like this/).textContent)).toContain('TRY 1,234.56');
  });
});
