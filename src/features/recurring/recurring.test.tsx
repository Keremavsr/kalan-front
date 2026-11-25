import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App, createQueryClient } from '../../App';
import { createMockApi, type MockOptions } from '../../api/mock';
import { ApiError, type KalanApi } from '../../api/types';
import { NBSP } from '../../lib/format';
import { renderApp } from '../../test/render';

const text = (s: string | null | undefined) => (s ?? '').split(NBSP).join(' ');
const invented = () => new File(['%PDF-1.4 invented'], 'ekstre-ekim.pdf', { type: 'application/pdf' });

async function renderWith(path: string, options: MockOptions = {}, patch: (api: KalanApi) => Promise<void> | void = () => {}) {
  const api = createMockApi({ latency: 0, uploadMs: 0, analysisMs: 30, ...options });
  await patch(api);
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false, staleTime: 0, refetchOnWindowFocus: false } });
  render(<App api={api} queryClient={queryClient} initialPath={path} />);
  return api;
}

const rowOf = (list: HTMLElement, name: string) => within(list).getByText(name, { selector: 'div' }).closest('li')!;

describe('recurring', () => {
  // Moved from screens.test.tsx; the yearly figure was a sum made on this side and is gone.
  it('lists recurring charges and the price rise', async () => {
    await renderApp('/recurring', { uploaded: true });
    const list = await screen.findByRole('list', { name: 'Düzenli ödemeler' });
    const row = within(list).getByText('STREAMFLIX').closest('li')!;
    expect(text(row.textContent)).toContain('+%20');
    expect(text(row.textContent)).not.toContain('yılda');
    expect(text(screen.getByText(/Fiyatı artan/).textContent)).toContain('Fiyatı artan: STREAMFLIX (+%20).');
  });
});

describe('recurring: cancelled subscriptions', () => {
  it('marks a subscription as cancelled and takes the mark back', async () => {
    const user = userEvent.setup();
    const api = await renderWith('/recurring', {}, async (a) => {
      await a.uploadStatement(invented());
    });
    const list = await screen.findByRole('list', { name: 'Düzenli ödemeler' });
    await user.click(await within(list).findByRole('button', { name: 'STREAMFLIX için iptal ettim işareti koy' }));
    const dialog = await screen.findByRole('dialog', { name: 'STREAMFLIX aboneliğini iptal ettim' });
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Yıl' }), '2026');
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Ay' }), '11');
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Gün' }), '1');
    await user.click(within(dialog).getByRole('button', { name: 'İşaretle' }));

    expect(await screen.findByText('STREAMFLIX iptal edildi olarak işaretlendi.')).toBeInTheDocument();
    expect((await api.listCancelledSubscriptions()).items).toContainEqual({ merchant: 'STREAMFLIX', cancelled_on: '2026-11-01' });
    expect(await within(rowOf(list, 'STREAMFLIX')).findByText(/1 Kas 2026 tarihinde iptal ettim dedin/)).toBeInTheDocument();

    await user.click(within(list).getByRole('button', { name: 'STREAMFLIX için iptal işaretini kaldır' }));
    expect(await screen.findByText('STREAMFLIX için iptal işaretini kaldırdım.')).toBeInTheDocument();
    expect(await within(list).findByRole('button', { name: 'STREAMFLIX için iptal ettim işareti koy' })).toBeInTheDocument();
  });

  it('marks a charge that came after the cancellation as critical', async () => {
    await renderWith('/recurring', { preset: 'full' });
    const list = await screen.findByRole('list', { name: 'Düzenli ödemeler' });
    const row = rowOf(list, 'MUZIKBOX');
    await waitFor(() => expect(text(row.textContent)).toContain('Kritik'));
    expect(text(row.textContent)).toMatch(/15 Eyl 2026 tarihinde iptal ettin ama sonra 1 çekim geldi: 59,99 TL\./);
    expect(within(row).getByRole('link', { name: 'Çekimi gör' })).toHaveAttribute('href', expect.stringMatching(/^\/spending\/2026-10\?tx=/));
  });

  it('says what failed when the cancel mark is not saved', async () => {
    const user = userEvent.setup();
    await renderWith('/recurring', {}, async (a) => {
      await a.uploadStatement(invented());
      a.addCancelledSubscription = () => Promise.reject(new ApiError(0, 'network', 'The local back end did not answer.'));
    });
    const list = await screen.findByRole('list', { name: 'Düzenli ödemeler' });
    await user.click(await within(list).findByRole('button', { name: 'STREAMFLIX için iptal ettim işareti koy' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'İşaretle' }));
    expect(await within(dialog).findByText(/Yerel sunucu yanıt vermiyor/)).toBeInTheDocument();
  });
});

describe('recurring: fixed costs', () => {
  it('shows which months were paid, which are missing, and a likely duplicate', async () => {
    await renderWith('/recurring', { preset: 'full' });
    const list = await screen.findByRole('list', { name: 'Sabit giderler' });
    const cloud = rowOf(list, 'BULUTDEPO');
    expect(await within(cloud).findByText(/Eylül 2026: ödendi/)).toBeInTheDocument();
    expect(text(cloud.textContent)).toContain('Ayın 3. günü');
    expect(text(cloud.textContent)).toContain('39,99 TL');
    const rent = rowOf(list, 'ORNEK KIRA');
    expect(within(rent).getAllByText(/ödeme bulamadım/).length).toBeGreaterThan(0);
    expect(within(rent).getByText(/ay eksik:/)).toBeInTheDocument();
    expect(screen.getByText('Aynı gider iki kez kayıtlı olabilir')).toBeInTheDocument();
    expect(screen.getByText(/Tutarı %7,5 içinde ve tarihi 2 gün içinde/)).toBeInTheDocument();
  });

  it('validates, adds and deletes a fixed cost', async () => {
    const user = userEvent.setup();
    const api = await renderWith('/recurring');
    expect(await screen.findByText(/Henüz sabit gider eklemedin/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sabit gider ekle' }));
    const dialog = await screen.findByRole('dialog', { name: 'Sabit gider ekle' });
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
    expect(within(dialog).getAllByText('Bu alan gerekli.')).toHaveLength(2);

    await user.type(within(dialog).getByLabelText('Ad'), 'ORNEK AIDAT');
    await user.type(within(dialog).getByLabelText('Aylık tutar'), '1.234,56');
    await user.selectOptions(within(dialog).getByLabelText('Ödeme günü'), '5');
    const start = within(dialog).getByRole('group', { name: 'Başlangıç ayı' });
    await user.selectOptions(within(start).getByRole('combobox', { name: 'Yıl' }), '2026');
    await user.selectOptions(within(start).getByRole('combobox', { name: 'Ay' }), '6');
    const end = within(dialog).getByRole('group', { name: 'Bitiş ayı' });
    await user.selectOptions(within(end).getByRole('combobox', { name: 'Ay' }), '1');
    await user.selectOptions(within(end).getByRole('combobox', { name: 'Yıl' }), '2026');
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
    expect(within(dialog).getByText('Bitiş ayı başlangıçtan önce olamaz.')).toBeInTheDocument();

    await user.selectOptions(within(end).getByRole('combobox', { name: 'Ay' }), '');
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
    expect(await screen.findByText('ORNEK AIDAT eklendi.')).toBeInTheDocument();
    const saved = (await api.listFixedCosts()).items;
    expect(saved).toEqual([expect.objectContaining({ name: 'ORNEK AIDAT', amount: 123456, day: 5, start: '2026-06', end: null })]);

    const list = await screen.findByRole('list', { name: 'Sabit giderler' });
    expect(text(rowOf(list, 'ORNEK AIDAT').textContent)).toContain('Haziran 2026 itibarıyla');
    await user.click(within(list).getByRole('button', { name: 'Gideri sil: ORNEK AIDAT' }));
    expect(await screen.findByText('ORNEK AIDAT giderini sildim.')).toBeInTheDocument();
    expect(await screen.findByText(/Henüz sabit gider eklemedin/)).toBeInTheDocument();
  });

  it('tells the user when the back end does not answer', async () => {
    await renderWith('/recurring', {}, (a) => {
      a.listFixedCosts = () => Promise.reject(new ApiError(0, 'network', 'The local back end did not answer.'));
    });
    const title = await screen.findByText('Sabit giderleri getiremedim.');
    expect(text(title.closest('[data-tone]')!.textContent)).toContain('Yerel sunucu yanıt vermiyor');
  });

  it('turns an invalid period from the back end into words', async () => {
    const user = userEvent.setup();
    await renderWith('/recurring', {}, (a) => {
      a.createFixedCost = () => Promise.reject(new ApiError(422, 'invalid_period', 'The end month is before the start month.'));
    });
    await user.click(await screen.findByRole('button', { name: 'Sabit gider ekle' }));
    const dialog = await screen.findByRole('dialog', { name: 'Sabit gider ekle' });
    await user.type(within(dialog).getByLabelText('Ad'), 'ORNEK AIDAT');
    await user.type(within(dialog).getByLabelText('Aylık tutar'), '1.234,56');
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Bitiş ayı başlangıçtan önce olamaz.');
  });
});
