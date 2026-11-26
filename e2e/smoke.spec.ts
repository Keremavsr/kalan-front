import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// The mock keeps its state in memory, so the whole journey uses in-app links, not page.goto.
const pdf = fileURLToPath(new URL('./fixtures/ornek-ekstre.pdf', import.meta.url));
/** A returning user: the first-run tour has been seen. The tour has its own test below. */
const SEEN = "localStorage.setItem('kalan.tourSeen', '1')";

test('the first-run tour walks three steps and leads to the upload screen; "Nasıl çalışır?" opens it again', async ({ page }) => {
  await page.goto('/');
  const dialog = page.getByRole('dialog', { name: 'Ekstreni bırak' });
  await expect(dialog).toBeVisible();
  await page.getByRole('button', { name: 'Devam' }).click();
  await expect(page.getByRole('dialog', { name: 'Ne ödeyeceğini gör' })).toBeVisible();
  await page.getByRole('button', { name: 'Devam' }).click();
  await page.getByRole('button', { name: 'Ekstre yükle' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Ekstreler' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Nasıl çalışır?' }).click();
  await expect(page.getByRole('dialog', { name: 'Ekstreni bırak' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('a first session on demo data', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const nav = (name: string) => page.getByRole('navigation', { name: 'Ana menü' }).getByRole('link', { name, exact: true });

  await page.addInitScript(SEEN);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Özet' })).toBeVisible();

  // Skip link is the first stop for keyboard users and has a visible focus.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'İçeriğe geç' })).toBeFocused();

  await page.getByRole('link', { name: 'Ayarlar', exact: true }).click();
  await expect(page.getByText('Bu bilgisayarda bulundu')).toHaveCount(2);
  await page.getByRole('radio', { name: /Claude Code/ }).click();
  await expect(page.getByText('Claude Code seçildi.')).toBeVisible();

  await nav('Ekstreler').click();
  await page.getByLabel('Dosya seç').setInputFiles(pdf);
  await expect(page.getByText('Toplamlar tutmuyor').first()).toBeVisible();
  await expect(page.getByText('Aradaki fark')).toBeVisible();

  await page.getByRole('link', { name: 'Taksitlere git' }).click();
  await expect(page.getByText(/şimdiden 28\.994,52\sTL taksit ödemesi var/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Nakit avans taksitinin içeriği' })).toBeVisible();
  // The current menu link carries the pencil scribble.
  await expect(nav('Taksitler')).toHaveAttribute('aria-current', 'page');

  await nav('Harcamalar').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Harcamalar' })).toBeVisible();
  await expect(page.getByLabel('Ay seç')).toHaveValue('2026-10');
  await page.getByLabel('Ara').fill('migros');
  await expect(page.getByText('3 / 19 işlem')).toBeVisible();

  await nav('Düzenli ödemeler').click();
  await expect(page.getByRole('list', { name: 'Düzenli ödemeler' }).getByText('STREAMFLIX')).toBeVisible();

  await nav('Haklarım').click();
  await expect(page.getByRole('heading', { name: 'Kart aidatı iadesi' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Kart aidatları' })).toContainText('1.234,56 TL');
  await expect(page.getByRole('heading', { name: 'Yalnız asgariyi ödersem' })).toBeVisible();

  await nav('Özet').click();
  await expect(page.getByRole('table', { name: 'Ödeyeceklerin' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Kalan taksitlerin' })).toBeVisible();

  // Choosing the tool started the batch; the upload joined it. The commentary sits in the statement detail.
  await nav('Ekstreler').click();
  await page.getByRole('list', { name: 'Yüklenen ekstreler' }).getByRole('link').first().click();
  await expect(page.getByText('Nakit avansın iki taksiti kaldı')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('link', { name: /STREAMFLIX/ }).first().click();
  await expect(page.getByText('Yorumda anılan işlem')).toBeVisible();

  expect(errors).toEqual([]);
});

test('the page never scrolls sideways at the 960 px window minimum', async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 720 });
  await page.addInitScript(SEEN);
  await page.goto('/');
  await page.getByRole('link', { name: 'Ayarlar', exact: true }).waitFor();
  const nav = page.getByRole('navigation', { name: 'Ana menü' });
  for (const name of ['Taksitler', 'Harcamalar', 'Düzenli ödemeler', 'Haklarım', 'Ekstreler', 'Özet']) {
    await nav.getByRole('link', { name, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForTimeout(300);
    // String expressions: the e2e tsconfig has no DOM types.
    const wide = await page.evaluate<number>('document.documentElement.scrollWidth - window.innerWidth');
    expect(wide, name).toBeLessThanOrEqual(0);
  }
});

test('reduced motion turns movement off', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto('/');
  const duration = await page.evaluate<string>("getComputedStyle(document.documentElement).getPropertyValue('--duration-2').trim()");
  expect(duration).toBe('1ms');
  await context.close();
});
