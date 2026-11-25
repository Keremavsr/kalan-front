import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../test/render';
import { NBSP } from '../../lib/format';
import { ReconciliationNotice } from './UploadPanel';

const pdf = (name: string) => new File(['%PDF-1.4 invented'], name, { type: 'application/pdf' });
const text = (s: string | null | undefined) => (s ?? '').split(NBSP).join(' ');
const choosePdf = () => screen.findByLabelText('Dosya seç');

afterEach(() => vi.restoreAllMocks());

describe('statement upload answers', () => {
  it('asks for the password of an encrypted PDF and remembers it on request', async () => {
    const user = userEvent.setup();
    await renderApp('/statements');
    await user.upload(await choosePdf(), pdf('ekstre-sifreli.pdf'));

    expect(await screen.findByRole('heading', { name: 'Bu PDF parolalı' })).toBeInTheDocument();
    // The bank hints from the back end are listed with the bank's name.
    expect(screen.getByText('T.C. kimlik numaranızın son 6 hanesi')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Aç ve oku' }));
    expect(screen.getByText('Parolayı yaz.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('PDF parolası'), '123456');
    await user.click(screen.getByRole('button', { name: 'Aç ve oku' }));
    expect(await screen.findByText('Bu parola dosyayı açmadı. Bir daha dene.')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('PDF parolası'));
    await user.type(screen.getByLabelText('PDF parolası'), '000000');
    await user.click(screen.getByLabelText('Bu bankanın parolasını hatırla'));
    await user.click(screen.getByRole('button', { name: 'Aç ve oku' }));

    expect(await screen.findByText('Okuduğum ekstre')).toBeInTheDocument();
    expect(screen.getByText('Örnekbank ekstrelerinin parolasını parola kasasında sakladım.')).toBeInTheDocument();
  });

  it('explains a blocked save and runs the diagnosis on the same file', async () => {
    const user = userEvent.setup();
    await renderApp('/statements');
    await user.upload(await choosePdf(), pdf('ekstre-engel.pdf'));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Ekstreyi kaydetmedim')).toBeInTheDocument();
    const findings = within(alert).getByRole('list', { name: 'Kayıt öncesi denetimin bulguları' });
    const rows = within(findings).getAllByRole('listitem');
    expect(rows[0]!.textContent).toBe('EngelBir toplam ile satırlar arasında 100 kat fark var. Ondalık ayracını yanlış okumuş olabilirim.');
    expect(rows[1]!.textContent).toContain('Kontrol et');
    expect(rows[1]!.textContent).toContain('52 gün');

    await user.click(within(alert).getByRole('button', { name: 'Teşhis raporu çıkar' }));
    const report = await screen.findByLabelText('Rapor', {}, { timeout: 3000 });
    expect((report as HTMLTextAreaElement).value).toMatch(/^kalan 0\.1\.0-mock, 2 pages/);
    expect(screen.getByText('tr_ornekbank_kart: 3 / 5 işaret bulundu')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /GitHub formunu aç/ })[0]).toHaveAttribute(
      'href',
      'https://github.com/Keremavsr/kalan-back/issues/new?template=bank-not-supported.yml',
    );
  });

  it('sends an unknown layout to the tool only after the user says yes, then offers a template draft', async () => {
    const user = userEvent.setup();
    const { api } = await renderApp('/statements');
    await user.upload(await choosePdf(), pdf('bilinmeyen-banka.pdf'));
    // No tool selected: the way forward is Settings, nothing is sent.
    expect(await screen.findByRole('link', { name: 'Ayarlar’a git' })).toHaveAttribute('href', '/settings');

    await api.selectProvider('claude-cli');
    await user.upload(await choosePdf(), pdf('bilinmeyen-banka.pdf'));
    const consent = await screen.findByRole('button', { name: 'Claude Code ile oku' });
    expect(screen.getByText(/Kart numarası, ad, adres, IBAN/)).toBeInTheDocument();
    await user.click(consent);

    expect(await screen.findByText('Seçtiğin araçla', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText('Kontrol etmen gereken yerler')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Şablon taslağı iste' }));
    const yaml = (await screen.findByLabelText('Şablon (YAML)')) as HTMLTextAreaElement;
    expect(yaml.value).toContain('id: tr_denemebank_kart');
    expect(screen.getByText('Taslak doğrulandı')).toBeInTheDocument();
  });

  it('links a repeated upload to the stored statement, which can be deleted', async () => {
    const user = userEvent.setup();
    await renderApp('/statements', { uploaded: true });
    await user.upload(await choosePdf(), pdf('ekstre-ekim.pdf'));

    const link = await screen.findByRole('link', { name: 'Kayıtlı ekstreyi aç' });
    expect(link).toHaveAttribute('href', '/statements?id=st_10');
    await user.click(link);
    expect(await screen.findByText('Ekstre ayrıntısı')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sil' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Sil' }));
    expect(await screen.findByText('Ekstreyi sildim.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Ekstre ayrıntısı')).not.toBeInTheDocument());
  });
});

describe('files in and out', () => {
  it('imports a CSV, lists it and deletes it', async () => {
    const user = userEvent.setup();
    await renderApp('/statements');
    const csv = new File(['date,description,amount\n2026-10-08,ORNEK ULASIM,-120.00\n2026-10-16,ORNEK KITABEVI 1/2,-500.00\n'], 'banka.csv', {
      type: 'text/csv',
    });
    await user.upload(await screen.findByLabelText('Banka dosyası ekle'), csv);

    expect(await screen.findByText('2 satır ekledim', {}, { timeout: 3000 })).toBeInTheDocument();
    const list = await screen.findByRole('list', { name: 'İçe aktarılan dosyalar' });
    expect(within(list).getByText('CSV, 2 satır')).toBeInTheDocument();

    await user.click(within(list).getByRole('button', { name: /CSV dosyasını sil/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Bu dosyadan gelen 2 satır silinir.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Sil' }));
    expect(await screen.findByText('Henüz içe aktarılan dosya yok.')).toBeInTheDocument();
  });

  it('downloads an export in the chosen format', async () => {
    const user = userEvent.setup();
    const created = vi.fn(() => 'blob:kalan');
    Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    await renderApp('/statements', { uploaded: true });

    await user.click(await screen.findByLabelText('Taksit planları'));
    expect(screen.getByText(/Süren her taksit planı bir satır/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'İndir' }));
    expect(await screen.findByText(/kalan-plans\.csv kaydedildi\./)).toBeInTheDocument();
    expect(created).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();

    // OFX holds one currency; the plans choice is CSV only, so it disappears.
    await user.click(screen.getByLabelText('OFX'));
    expect(screen.queryByLabelText('Taksit planları')).not.toBeInTheDocument();
  });
});

describe('reconciliation', () => {
  it('says plainly when no reconciliation ran', () => {
    render(<ReconciliationNotice reconciliation={null} currency="TRY" />);
    expect(screen.getByText('Toplamları karşılaştıramadım')).toBeInTheDocument();
    expect(text(screen.getByText(/satırları karşılaştıracağım/).textContent)).toContain('bankanın ekranından kontrol et');
  });
});
