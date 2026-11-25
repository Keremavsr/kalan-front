// Takes the review screenshots on demo data, headless, at 1440x900.
// Usage: npm run build:mock && npm run shots -- <output dir>
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = resolve(process.argv[2] ?? join(root, 'test-results', 'shots'));
const base = 'http://127.0.0.1:4317';
const pdf = join(root, 'e2e', 'fixtures', 'ornek-ekstre.pdf');
mkdirSync(outDir, { recursive: true });

const server = spawn(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview'], {
  cwd: root,
  stdio: 'ignore',
});

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(base);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('preview server did not start');
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const shot = (name) => page.screenshot({ path: join(outDir, name) });

  await page.goto(base);
  await page.getByRole('link', { name: 'Kurulum' }).click();
  await page.getByRole('radio', { name: /Claude Code/ }).click();
  await page.getByText('Claude Code seçildi.').waitFor();
  await page.getByRole('button', { name: 'Bildirimi kapat' }).click();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(300);
  await shot('kalan-kurulum.png');

  await page.getByRole('link', { name: 'Ekstre yükle' }).click();
  await page.getByLabel('Dosya seçin').setInputFiles(pdf);
  await page.getByText('Toplamlar tutmuyor').waitFor();
  await page.waitForTimeout(300);
  await shot('kalan-yukleme-uyusmazlik.png');

  await page.getByRole('link', { name: 'Taksit takvimine git' }).click();
  await page.getByText(/şimdiden/).waitFor();
  await page.waitForTimeout(300);
  await shot('kalan-taksit-takvimi.png');

  await page.getByRole('link', { name: 'Ay özeti' }).click();
  await page.getByRole('heading', { level: 1, name: /Ekim 2026/ }).waitFor();
  await page.getByText(/işlem$/).first().waitFor();
  await page.waitForTimeout(300);
  await shot('kalan-ay-ozeti.png');

  if (process.env.KALAN_EXTRA_SHOTS === '1') {
    await page.getByRole('link', { name: 'Abonelikler' }).click();
    await page.getByRole('rowheader', { name: 'STREAMFLIX' }).waitFor();
    await shot('kalan-abonelikler.png');
    await page.getByRole('link', { name: 'Dikkat edilecekler' }).click();
    await page.getByRole('button', { name: 'Yorumla' }).click();
    await page.getByText(/Yorum hazırlanıyor/).waitFor();
    await page.waitForTimeout(2200);
    await shot('kalan-dikkat-bekliyor.png');
    await page.getByText('Nakit avansın iki taksiti kaldı').waitFor({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Bildirimi kapat' }).click();
    await page.waitForTimeout(300);
    await shot('kalan-dikkat.png');
    await page.getByRole('link', { name: /STREAMFLIX/ }).first().click();
    await page.getByText('Yorumda anılan işlem').waitFor();
    await page.waitForTimeout(300);
    await shot('kalan-ay-vurgu.png');
  }

  console.log(`saved to ${outDir}`);
} finally {
  await browser?.close();
  server.kill();
}
