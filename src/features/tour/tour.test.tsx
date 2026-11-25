import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../test/render';
import { TOUR_KEY } from './Tour';

describe('first-run tour', () => {
  it('opens by itself on a fresh profile, walks three steps and leads to the upload screen', async () => {
    localStorage.removeItem(TOUR_KEY);
    const user = userEvent.setup();
    await renderApp('/');

    const dialog = await screen.findByRole('dialog', { name: 'Ekstreni bırak' });
    expect(within(dialog).getByRole('img', { name: '3 adımdan 1. adım' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Devam' }));
    expect(screen.getByRole('dialog', { name: 'Ne ödeyeceğini gör' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Devam' }));
    expect(screen.getByRole('dialog', { name: 'İstersen bir yapay zekâ aracı bağla' })).toBeInTheDocument();
    expect(within(dialog).getByText(/Araca ekstrelerindeki işlemlerin/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Ekstre yükle' }));
    expect(screen.queryByRole('dialog', { name: /yapay zekâ/ })).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 1, name: 'Ekstreler' })).toBeInTheDocument();
    expect(localStorage.getItem(TOUR_KEY)).toBe('1');
  });

  it('can be skipped, stays closed afterwards and opens again from "Nasıl çalışır?"', async () => {
    localStorage.removeItem(TOUR_KEY);
    const user = userEvent.setup();
    await renderApp('/');

    const dialog = await screen.findByRole('dialog', { name: 'Ekstreni bırak' });
    await user.click(within(dialog).getAllByRole('button', { name: 'Atla' })[0]!);
    expect(screen.queryByRole('dialog', { name: 'Ekstreni bırak' })).not.toBeInTheDocument();
    expect(localStorage.getItem(TOUR_KEY)).toBe('1');
    expect(screen.getByRole('heading', { level: 1, name: 'Özet' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Nasıl çalışır?' }));
    const again = await screen.findByRole('dialog', { name: 'Ekstreni bırak' });
    await user.click(within(again).getByRole('button', { name: 'Devam' }));
    await user.click(within(again).getByRole('button', { name: 'Geri' }));
    expect(screen.getByRole('dialog', { name: 'Ekstreni bırak' })).toBeInTheDocument();
  });

  it('does not open for a returning user', async () => {
    await renderApp('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Özet' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Ekstreni bırak' })).not.toBeInTheDocument();
  });
});
