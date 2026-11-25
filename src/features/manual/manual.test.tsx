import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App, createQueryClient } from '../../App';
import { createMockApi } from '../../api/mock';
import { renderApp } from '../../test/render';

describe('manual entry: date in the app language', () => {
  it('picks day, month name and year in Turkish and stores the ISO date', async () => {
    const user = userEvent.setup();
    const { api } = await renderApp('/installments');
    await user.click(await screen.findByRole('button', { name: 'Harcama ekle' }));
    const dialog = await screen.findByRole('dialog');
    const date = within(dialog).getByRole('group', { name: 'Tarih' });
    const month = within(date).getByRole('combobox', { name: 'Ay' });
    expect(within(month).getByRole('option', { name: 'Ekim' })).toBeInTheDocument();
    // Turkish writes the day first: 3 Ekim 2026.
    expect(within(date).getAllByRole('combobox').map((c) => c.getAttribute('aria-label'))).toEqual(['Gün', 'Ay', 'Yıl']);

    await user.selectOptions(within(date).getByRole('combobox', { name: 'Yıl' }), '2026');
    await user.selectOptions(month, '2');
    await user.selectOptions(within(date).getByRole('combobox', { name: 'Gün' }), '28');
    // February has 28 days in 2026; a later month change keeps the day valid.
    expect(within(within(date).getByRole('combobox', { name: 'Gün' })).queryByRole('option', { name: '29' })).toBeNull();

    await user.type(within(dialog).getByLabelText('Açıklama'), 'ORNEK ELLE');
    await user.type(within(dialog).getByLabelText('Toplam tutar'), '1.234,56');
    await user.click(within(dialog).getByRole('button', { name: 'Ekle' }));
    expect(await screen.findByText('Harcama eklendi.')).toBeInTheDocument();
    const rows = (await api.listTransactions({ source: 'manual' })).items;
    expect(rows.map((t) => t.date)).toEqual(['2026-02-28']);
  });

  it('writes the month names in English when the app is in English', async () => {
    const user = userEvent.setup();
    const api = createMockApi({ latency: 0 });
    await api.putSettings({ ...(await api.getSettings()), locale: 'en' });
    const queryClient = createQueryClient();
    queryClient.setDefaultOptions({ queries: { retry: false, staleTime: 0, refetchOnWindowFocus: false } });
    render(<App api={api} queryClient={queryClient} initialPath="/installments" />);
    await user.click(await screen.findByRole('button', { name: 'Add purchase' }));
    const dialog = await screen.findByRole('dialog');
    const date = within(dialog).getByRole('group', { name: 'Date' });
    expect(within(within(date).getByRole('combobox', { name: 'Month' })).getByRole('option', { name: 'October' })).toBeInTheDocument();
  });
});
