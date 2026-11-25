import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../test/render';
import { NBSP } from '../../lib/format';

const text = (s: string | null | undefined) => (s ?? '').split(NBSP).join(' ');

describe('rights', () => {
  // Moved from screens.test.tsx: the screen no longer holds its place, it shows the fees it found.
  it('says plainly when no annual fee was found', async () => {
    await renderApp('/rights');
    expect(await screen.findByRole('heading', { level: 1, name: 'Haklarım' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Ekstrelerinde yıllık aidat görmedim' })).toBeInTheDocument();
  });

  it('shows where to apply for a fee refund, with the limit and its source', async () => {
    const user = userEvent.setup();
    await renderApp('/rights', { uploaded: true });
    const list = await screen.findByRole('list', { name: 'Kart aidatları' });
    expect(text(list.textContent)).toContain('1.234,56 TL');
    await user.click(within(list).getByRole('button', { name: /aidatı için dilekçe hazırla/ }));

    expect(await screen.findByText('Tüketici Hakem Heyeti')).toBeInTheDocument();
    expect(screen.getByText(/altı hakem heyetine gider/).textContent.replace(/\s/g, ' ')).toMatch(/^2026 için 186\.000,00 TL altı hakem heyetine gider/);
    expect(screen.getByText('Örnek dayanak (mock)')).toBeInTheDocument();
    expect(screen.getAllByText(/kaynak doğrulanmadı/).length).toBeGreaterThan(0);
    // Without a tool the prompt can still be copied; the letter cannot be written here.
    expect(screen.getByRole('button', { name: 'İstemi kopyala' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ile yaz$/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Burada yazdırmak için bir yorum aracı seçili olmalı/)).toBeInTheDocument();
  });

  it('writes an editable letter and names the placeholders still to fill in', async () => {
    const user = userEvent.setup();
    const { api } = await renderApp('/rights', { uploaded: true });
    await api.selectProvider('claude-cli');
    const list = await screen.findByRole('list', { name: 'Kart aidatları' });
    await user.click(within(list).getByRole('button', { name: /dilekçe hazırla/ }));
    await user.click(await screen.findByRole('button', { name: 'Claude Code ile yaz' }));

    const letter = await screen.findByLabelText<HTMLTextAreaElement>('Dilekçe');
    expect(letter.value).toContain('kart aidatının iadesini talep ederim');
    const missing = screen.getByText('Taslakta eksik alanlar var').closest('[data-tone]') as HTMLElement;
    expect(missing.textContent).toContain('[TELEFON]');
    expect(screen.getByText('Doldurman gereken yerler:').parentElement!.textContent).toContain('[AD SOYAD]');

    // The list follows the edited text.
    await user.clear(letter);
    await user.type(letter, 'Sayın yetkili, iade talep ederim.');
    expect(screen.getByText('Köşeli parantezli bir alan kalmadı.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yazdır' })).toBeInTheDocument();
  });

  it('shows what paying only the minimum costs, with the source of each rate', async () => {
    const user = userEvent.setup();
    await renderApp('/rights', { uploaded: true });
    const sentence = await screen.findByText(/yalnız asgari ödeyerek kapatmak/);
    expect(text(sentence.textContent)).toMatch(/\d+ ekstre sürer/);
    // One figure is ringed by the pencil: what it costs on top.
    expect(sentence.querySelectorAll('[data-pencil="circle"]')).toHaveLength(1);
    expect(screen.getAllByText('ekstrende yazan').length).toBeGreaterThan(0);
    expect(screen.getAllByText('yasal sınır, veri dosyası').length).toBeGreaterThan(0);
    expect(screen.getByText('Her asgari ödeme son ödeme gününde tam yapılır, gecikme faizi işlemez.')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /Ekstre ekstre borç/ })).toBeInTheDocument();

    await user.click(screen.getByLabelText('Planlanmış taksitleri de ekle'));
    await waitFor(() => expect(screen.getByRole('columnheader', { name: 'Eklenen taksit' })).toBeInTheDocument());
  });

  it('asks for a statement when there is none', async () => {
    const { api, queryClient } = await renderApp('/rights');
    for (const { id } of (await api.listStatements()).items) await api.deleteStatement(id);
    await queryClient.invalidateQueries();
    expect(await screen.findByRole('heading', { name: 'Hesap için bir ekstre gerekiyor' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ekstrelere git' })).toHaveAttribute('href', '/statements');
  });
});
