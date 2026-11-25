import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App, createQueryClient } from '../../App';
import { createMockApi, type MockOptions } from '../../api/mock';
import { ApiError, type KalanApi } from '../../api/types';
import { NBSP } from '../../lib/format';

const text = (s: string | null | undefined) => (s ?? '').split(NBSP).join(' ');

/** The app on the mock, with `patch` replacing client methods before the first request. */
async function renderWith(path: string, options: MockOptions = {}, patch: (api: KalanApi) => Promise<void> | void = () => {}) {
  const api = createMockApi({ latency: 0, uploadMs: 0, analysisMs: 30, ...options });
  await patch(api);
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false, staleTime: 0, refetchOnWindowFocus: false } });
  render(<App api={api} queryClient={queryClient} initialPath={path} />);
  return api;
}

const network = () => Promise.reject(new ApiError(0, 'network', 'The local back end did not answer.'));

describe('spending: statement month', () => {
  it('lists a statement row in the month its statement ends, a manual row in its own month', async () => {
    const api = createMockApi({ latency: 0 });
    const sep = await api.listTransactions({ month: '2026-09' });
    // st_09 runs 26 Aug - 25 Sep: the 28 Aug row belongs to September.
    expect(sep.items.some((t) => t.date === '2026-08-28')).toBe(true);
    expect(sep.items.some((t) => t.date === '2026-09-27')).toBe(false);
    await api.createTransaction({ date: '2026-09-28', description: 'ORNEK ELLE', amount: 123456, currency: 'TRY', direction: 'debit', installment: null });
    const manual = (await api.listTransactions({ month: '2026-09', source: 'manual' })).items;
    expect(manual.map((t) => t.date)).toEqual(['2026-09-28']);
  });
});

describe('spending: source filter', () => {
  it('filters the month by where a row came from', async () => {
    const user = userEvent.setup();
    await renderWith('/spending/2026-09', {}, async (api) => {
      await api.createTransaction({ date: '2026-09-12', description: 'ORNEK ELLE', amount: 123456, currency: 'TRY', direction: 'debit', installment: null });
    });
    expect(await screen.findByText('12 / 12 işlem')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Kaynak'), 'manual');
    expect(screen.getByText('1 / 12 işlem')).toBeInTheDocument();
    expect(screen.getByText('ORNEK ELLE')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Kaynak'), 'statement');
    expect(screen.getByText('11 / 12 işlem')).toBeInTheDocument();
  });

  it('says so when the month’s rows do not load', async () => {
    await renderWith('/spending/2026-09', {}, (api) => {
      api.listTransactions = network;
    });
    expect(await screen.findByText('Bu ayın işlemlerini getiremedim.')).toBeInTheDocument();
    expect(screen.getAllByText(/Yerel sunucu yanıt vermiyor/).length).toBeGreaterThan(0);
  });
});

describe('spending: category rules', () => {
  it('changes a category for every row of the merchant and lists the rule', async () => {
    const user = userEvent.setup();
    const api = await renderWith('/spending/2026-09');
    await user.click(await screen.findByRole('button', { name: 'Kategoriyi değiştir: KAFE-ORNEK, şimdi Yeme içme' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/adı KAFE-ORNEK olan bütün işlemler/)).toBeInTheDocument();
    const apply = within(dialog).getByRole('button', { name: 'Bu işyerinin hepsine uygula' });
    expect(apply).toBeDisabled();
    await user.selectOptions(await within(dialog).findByLabelText('Yeni kategori'), 'groceries');
    await user.click(apply);

    expect(await screen.findByText('KAFE-ORNEK artık Market. 2 işlem değişti.')).toBeInTheDocument();
    const rules = await screen.findByRole('list', { name: 'Kategori kuralları' });
    expect(within(rules).getByText('KAFE-ORNEK')).toBeInTheDocument();
    expect(within(rules).getByText('Kategori: Market')).toBeInTheDocument();
    // Both statements moved, not only the one on screen.
    const aug = await api.listTransactions({ month: '2026-08' });
    expect(aug.items.filter((t) => t.merchant === 'KAFE-ORNEK').map((t) => t.category)).toEqual(['groceries']);
  });

  it('offers no rule on rows without a merchant or added by hand', async () => {
    await renderWith('/spending/2026-10', { preset: 'full' });
    const row = (await screen.findByText('Önceki dönem bakiyesi')).closest('tr')!;
    expect(within(row).queryByRole('button')).toBeNull();
    expect(screen.getAllByRole('button', { name: /^Kategoriyi değiştir:/ }).length).toBeGreaterThan(10);
  });

  it('offers to replace a rule that already exists for the merchant', async () => {
    const user = userEvent.setup();
    await renderWith('/spending/2026-09', {}, async (api) => {
      await api.createCategoryRule({ pattern: 'kafe-ornek', category: 'other', apply: false });
    });
    await user.click(await screen.findByRole('button', { name: /Kategoriyi değiştir: KAFE-ORNEK/ }));
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(await within(dialog).findByLabelText('Yeni kategori'), 'groceries');
    await user.click(within(dialog).getByRole('button', { name: 'Bu işyerinin hepsine uygula' }));
    expect(await within(dialog).findByText('Bu işyeri için zaten bir kural var')).toBeInTheDocument();
    expect(within(dialog).getByText('Eski kural kafe-ornek işyerini Diğer yapıyor. Yenisiyle değiştirebilirim.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Eski kuralı değiştir' }));
    expect(await screen.findByText(/KAFE-ORNEK artık Market/)).toBeInTheDocument();
    const rules = await screen.findByRole('list', { name: 'Kategori kuralları' });
    await waitFor(() => expect(within(rules).queryByText('kafe-ornek')).not.toBeInTheDocument());
  });

  it('explains a pattern the back end refuses', async () => {
    const user = userEvent.setup();
    await renderWith('/spending/2026-09', {}, (api) => {
      api.createCategoryRule = () => Promise.reject(new ApiError(422, 'invalid_pattern', 'The pattern has no letters or digits.'));
    });
    await user.click(await screen.findByRole('button', { name: /Kategoriyi değiştir: KAFE-ORNEK/ }));
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(await within(dialog).findByLabelText('Yeni kategori'), 'groceries');
    await user.click(within(dialog).getByRole('button', { name: 'Bu işyerinin hepsine uygula' }));
    expect(await within(dialog).findByText('Bu işyeri adında harf ya da rakam yok, ona kural kuramıyorum.')).toBeInTheDocument();
  });

  it('deletes a rule and keeps the categories it set', async () => {
    const user = userEvent.setup();
    await renderWith('/spending/2026-09', { preset: 'full' });
    const rules = await screen.findByRole('list', { name: 'Kategori kuralları' });
    await user.click(within(rules).getByRole('button', { name: 'Kuralı sil: KAFE-ORNEK' }));
    expect(await screen.findByText('KAFE-ORNEK kuralını sildim. Koyduğu kategoriler yerinde kaldı.')).toBeInTheDocument();
    expect(await screen.findByText(/Henüz kural yok/)).toBeInTheDocument();
  });

  it('shows a failed rule list with a retry', async () => {
    await renderWith('/spending/2026-09', {}, (api) => {
      api.getCategoryRules = network;
    });
    const alert = await screen.findByText('Kategori kurallarını getiremedim.');
    const notice = alert.closest('[data-tone]') as HTMLElement;
    expect(text(notice.textContent)).toContain('Yerel sunucu yanıt vermiyor');
    expect(within(notice).getByRole('button', { name: 'Yeniden dene' })).toBeInTheDocument();
  });
});
