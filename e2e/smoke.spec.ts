import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// The mock keeps its state in memory, so the whole journey uses in-app links, not page.goto.
const pdf = fileURLToPath(new URL('./fixtures/ornek-ekstre.pdf', import.meta.url));

test('a first session on demo data', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Taksit takvimi' })).toBeVisible();

  // Skip link is the first stop for keyboard users and has a visible focus.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'İçeriğe geç' })).toBeFocused();

  await page.getByRole('link', { name: 'Kurulum' }).click();
  await expect(page.getByText('Bu bilgisayarda bulundu')).toHaveCount(2);
  await page.getByRole('radio', { name: /Claude Code/ }).click();
  await expect(page.getByText('Claude Code seçildi.')).toBeVisible();

  await page.getByRole('link', { name: 'Ekstre yükle' }).click();
  await page.getByLabel('Dosya seçin').setInputFiles(pdf);
  await expect(page.getByText('Toplamlar tutmuyor')).toBeVisible();
  await expect(page.getByText('Aradaki fark')).toBeVisible();

  await page.getByRole('link', { name: 'Taksit takvimine git' }).click();
  await expect(page.getByText(/şimdiden 28\.994,52\sTL taksit ödemesi var/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Nakit avans taksitinin içeriği' })).toBeVisible();

  await page.getByRole('link', { name: 'Ay özeti' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Ay özeti: Ekim 2026' })).toBeVisible();
  await page.getByLabel('Ara').fill('migros');
  await expect(page.getByText('3 / 19 işlem')).toBeVisible();

  await page.getByRole('link', { name: 'Abonelikler' }).click();
  await expect(page.getByRole('rowheader', { name: 'STREAMFLIX' })).toBeVisible();

  await page.getByRole('link', { name: 'Dikkat edilecekler' }).click();
  await page.getByRole('button', { name: 'Yorumla' }).click();
  await expect(page.getByText(/Yorum hazırlanıyor/)).toBeVisible();
  await expect(page.getByText('Nakit avansın iki taksiti kaldı')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('link', { name: /STREAMFLIX/ }).first().click();
  await expect(page.getByText('Yorumda anılan işlem')).toBeVisible();

  expect(errors).toEqual([]);
});
