import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../test/render';
import { fromField, ruleDefaults, toField } from './rules';

describe('settings', () => {
  it('offers four languages, each in its own name, and keeps the choice', async () => {
    const user = userEvent.setup();
    const { api } = await renderApp('/settings');
    for (const name of ['Türkçe', 'English', 'Español', 'Português']) expect(await screen.findByLabelText(name)).toBeInTheDocument();
    await user.click(screen.getByLabelText('Português'));
    await waitFor(() => expect(document.documentElement.lang).toBe('pt'));
    expect((await api.getSettings()).locale).toBe('pt');
  });

  it('sets the default installment period', async () => {
    const user = userEvent.setup();
    const { api } = await renderApp('/settings');
    await user.click(await screen.findByLabelText('24 ay'));
    await waitFor(async () => expect((await api.getSettings()).months_ahead).toBe(24));
  });

  it('overrides a rate, shows whose value is used, and goes back to the defaults', async () => {
    const user = userEvent.setup();
    const { api } = await renderApp('/settings');
    const field = await screen.findByLabelText('Akdi faiz, aylık için senin değerin');
    // The data file's value is shown beside the field.
    expect(screen.getAllByText(/Varsayılan %3,25/).length).toBeGreaterThan(0);

    await user.type(field, 'üç');
    await user.click(screen.getByRole('button', { name: 'Oranları kaydet' }));
    expect(screen.getByText('Aylık yüzdeyi rakamla yaz, örnek 3,08.')).toBeInTheDocument();

    await user.clear(field);
    await user.type(field, '3,08');
    await user.type(screen.getByLabelText('Asgari ödeme oranı için senin değerin'), '25');
    await user.click(screen.getByRole('button', { name: 'Oranları kaydet' }));
    expect(await screen.findByText('Oranlar kaydedildi.')).toBeInTheDocument();
    expect((await api.getInsightRules()).overrides).toMatchObject({ contractual_monthly: '3.08', minimum_ratio: '0.25', bsmv: null });
    expect(screen.getAllByText(/senin değerin kullanılıyor/)).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Varsayılana dön' }));
    expect(await screen.findByText('Varsayılan oranlara döndüm.')).toBeInTheDocument();
    expect((await api.getInsightRules()).overrides.contractual_monthly).toBeNull();
    expect(field).toHaveValue('');
  });

  it('lists the banks with a remembered PDF password and forgets one', async () => {
    const user = userEvent.setup();
    const { api, queryClient } = await renderApp('/settings');
    await api.putPdfPassword('ornekbank', '000000');
    await queryClient.invalidateQueries({ queryKey: ['pdf-passwords'] });
    const list = await screen.findByRole('list', { name: 'Hatırlanan PDF parolaları' });
    const forget = await within(list).findByRole('button', { name: 'Örnekbank parolasını unut' });
    expect(within(list).getByText('İpucu: T.C. kimlik numaranızın son 6 hanesi')).toBeInTheDocument();
    await user.click(forget);
    expect(await screen.findByText('Örnekbank parolasını unuttum.')).toBeInTheDocument();
    expect((await api.getPdfPasswords()).items.every((i) => !i.remembered)).toBe(true);
  });
});

describe('rule values', () => {
  it('reads the dated rules file and its sources', () => {
    const rules = {
      interest: {
        sets: [
          { effective_from: '2026-01-01', tiers: [{ contractual_monthly: '3.25', late_monthly: '3.55' }], source: 'https://example.invalid/a' },
          {
            effective_from: '2026-12-01',
            tiers: [
              { contractual_monthly: '3.08', late_monthly: '3.38' },
              { contractual_monthly: '3.58', late_monthly: '3.88' },
            ],
            source: 'https://example.invalid/b',
          },
        ],
      },
      taxes_on_interest: { bsmv: '0.15', kkdf: '0.15', source: 'Karar 7345' },
      minimum_payment: { sets: [{ effective_from: '2026-10-01', tiers: [{ ratio: '0.20' }, { ratio: '0.40' }], source: 'https://example.invalid/c' }] },
    };
    const before = ruleDefaults(rules, '2026-11-30');
    expect(before.contractual_monthly).toEqual({ values: ['3.25'], source: 'https://example.invalid/a' });
    expect(ruleDefaults(rules, '2026-12-01').contractual_monthly.values).toEqual(['3.08', '3.58']);
    expect(before.bsmv).toEqual({ values: ['0.15'], source: 'Karar 7345' });
    expect(before.minimum_ratio.values).toEqual(['0.20', '0.40']);
  });

  it('turns typed percents into the API strings and back', () => {
    expect(fromField('contractual_monthly', '3,08')).toBe('3.08');
    expect(fromField('bsmv', '15')).toBe('0.15');
    expect(fromField('minimum_ratio', '%40')).toBe('0.4');
    expect(fromField('kkdf', '')).toBeNull();
    expect(fromField('bsmv', '150')).toBeUndefined();
    expect(fromField('late_monthly', 'abc')).toBeUndefined();
    expect(toField('bsmv', '0.15', ',')).toBe('15');
    expect(toField('contractual_monthly', '3.08', ',')).toBe('3,08');
  });
});
