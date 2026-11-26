/* global window, document, PopStateEvent -- used inside page.evaluate callbacks, which run in the browser */
// Review screenshots on demo data, headless, at 1440x900 and 1024x768 (full page), plus the tour and error states.
// The journey uses the "full" mock preset (two cards, a missing month, a closed plan, bills, an AI tool selected).
// Also measures sideways scrolling at 960 px (the desktop minimum) and prints a line per screen.
// Usage: npm run shots -- <output dir>
//   It builds the full-preset mock into dist-full/ and the HTTP flavour into dist-http/ (no back end running).
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = resolve(process.argv[2] ?? join(root, 'test-results', 'shots'));
const base = `http://127.0.0.1:${process.env.KALAN_PREVIEW_PORT ?? 4317}`;
const vite = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
mkdirSync(outDir, { recursive: true });

const SIZES = [
  { name: '1440', width: 1440, height: 900 },
  { name: '1024', width: 1024, height: 768 },
];

/** A returning user: the first-run tour has been seen. */
const SEEN = "localStorage.setItem('kalan.tourSeen', '1')";

function build(outDirName, env) {
  const built = spawnSync(process.execPath, [vite, 'build', '--mode', 'mock', '--outDir', outDirName], {
    cwd: root,
    stdio: 'ignore',
    env: { ...process.env, ...env },
  });
  if (built.status !== 0) throw new Error(`build into ${outDirName} failed`);
}

function preview(outDirName) {
  return spawn(process.execPath, [vite, 'preview', '--outDir', outDirName], { cwd: root, stdio: 'ignore' });
}

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

const overflow = [];

async function checkOverflow(page, label) {
  const size = page.viewportSize();
  await page.setViewportSize({ width: 960, height: 720 });
  await page.waitForTimeout(150);
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  overflow.push(`${label}: ${wide > 0 ? `scrolls ${wide}px sideways` : 'no sideways scroll'} at 960px`);
  await page.setViewportSize(size);
  await page.waitForTimeout(150);
}

/** In-app navigation that keeps the in-memory mock (page.goto would reset it). */
async function go(page, path) {
  await page.evaluate((p) => {
    window.history.pushState({}, '', p);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

async function tour(browser, size) {
  const page = await browser.newPage({ viewport: { width: size.width, height: size.height }, reducedMotion: 'reduce' });
  await page.goto(base);
  await page.getByRole('dialog', { name: 'Ekstreni bırak' }).waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(outDir, `00-tanitim-1-${size.name}.png`) });
  await page.getByRole('button', { name: 'Devam' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(outDir, `00-tanitim-2-${size.name}.png`) });
  await page.getByRole('button', { name: 'Devam' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(outDir, `00-tanitim-3-${size.name}.png`) });
  await page.close();
}

async function journey(browser, size) {
  const page = await browser.newPage({ viewport: { width: size.width, height: size.height }, reducedMotion: 'reduce' });
  await page.addInitScript(SEEN);
  const shot = async (name, measure = false) => {
    // A full-page shot taken while scrolled draws the sticky menu in the middle of the page.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.mouse.move(0, 0);
    await page.waitForTimeout(250);
    await page.screenshot({ path: join(outDir, `${name}-${size.name}.png`), fullPage: true });
    if (measure && size.name === '1440') await checkOverflow(page, name);
  };
  const dismissToasts = async () => {
    for (const b of await page.getByRole('button', { name: 'Bildirimi kapat' }).all()) await b.click().catch(() => {});
  };
  const nav = (name) => page.getByRole('navigation', { name: 'Ana menü' }).getByRole('link', { name, exact: true });

  await page.goto(base);
  await page.getByRole('table', { name: 'Ödeyeceklerin' }).waitFor();
  await page.getByRole('list', { name: 'Tasarruf önerileri' }).waitFor();
  await shot('01-ozet', true);

  await nav('Taksitler').click();
  await page.getByRole('table', { name: 'Ödeme planı' }).waitFor();
  await shot('02-taksitler', true);

  await nav('Harcamalar').click();
  await page.getByText(/işlem$/).first().waitFor();
  await shot('03-harcamalar', true);
  await go(page, '/spending/2026-09');
  await page.getByText(/Kategorisiz \d+ işlem/).waitFor();
  await shot('03-harcamalar-kategorisiz');

  await nav('Düzenli ödemeler').click();
  await page.getByRole('list', { name: 'Faturalar' }).waitFor();
  await shot('04-duzenli-odemeler', true);

  await nav('Haklarım').click();
  await page.getByRole('heading', { level: 1, name: 'Haklarım' }).waitFor();
  await shot('05-haklarim', true);

  await nav('Ekstreler').click();
  await page.getByRole('region', { name: /ekstre eksik|Eksik ekstreler/ }).waitFor();
  await shot('06-ekstreler', true);
  await page.getByRole('list', { name: 'Yüklenen ekstreler' }).getByRole('link').first().click();
  await page.getByRole('heading', { name: 'Yorum' }).waitFor();
  await shot('06-ekstre-ayrinti');

  // Choosing another tool starts the batch over every statement: the strip under the menu shows it.
  await page.getByRole('link', { name: 'Ayarlar', exact: true }).click();
  await page.getByRole('radio', { name: /Codex CLI/ }).click();
  await page.getByText(/ekstrelerini okuyor/).waitFor();
  await dismissToasts();
  await shot('07-ayarlar-ai-calisiyor', true);
  await page.getByText('Kategoriler ve öneriler yenilendi.').waitFor({ timeout: 30_000 });
  await dismissToasts();

  await nav('Özet').click();
  await page.getByText('Yapay zekâ önerisi').first().waitFor({ timeout: 10_000 }).catch(() => {});
  await page.getByRole('button', { name: /öneri daha/ }).click().catch(() => {});
  await shot('01-ozet-ai-sonrasi');

  await page.getByRole('button', { name: 'Harcama ekle' }).click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('dialog').getByRole('button', { name: 'Ekle' }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(outDir, `09-harcama-ekle-${size.name}.png`) });
  await page.close();
}

async function errorShots(browser) {
  for (const size of SIZES) {
    const page = await browser.newPage({ viewport: { width: size.width, height: size.height }, reducedMotion: 'reduce' });
    await page.addInitScript(SEEN);
    await page.goto(`${base}/installments`);
    await page.getByRole('alert').waitFor({ timeout: 20_000 });
    await page.screenshot({ path: join(outDir, `10-hata-arka-uc-yok-${size.name}.png`), fullPage: true });
    await page.close();
  }
}

async function desktopStatus(browser) {
  const url = pathToFileURL(join(root, 'desktop', 'static', 'status.html')).toString();
  const states = [
    { name: '11-masaustu-acilis', status: { state: 'starting' } },
    {
      name: '12-masaustu-hata',
      status: {
        state: 'error',
        message: 'Exit code 1.',
        stderr: ['Traceback (most recent call last):', '  File "kalan/serve.py", line 41, in main', 'OSError: [Errno 98] Address already in use'],
      },
    },
  ];
  for (const size of SIZES)
    for (const s of states) {
      const page = await browser.newPage({ viewport: { width: size.width, height: size.height }, reducedMotion: 'reduce', locale: 'tr-TR' });
      await page.addInitScript((status) => {
        window.kalan = { getStatus: async () => status, onStatus: () => {}, restartBackend: async () => {} };
      }, s.status);
      await page.goto(url);
      await page.waitForTimeout(300);
      await page.evaluate(() => document.querySelector('details')?.setAttribute('open', ''));
      await page.screenshot({ path: join(outDir, `${s.name}-${size.name}.png`) });
      await page.close();
    }
}

let server;
let browser;
try {
  build('dist-full', { VITE_KALAN_MOCK: '1', VITE_KALAN_MOCK_PRESET: 'full' });
  server = preview('dist-full');
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  for (const size of SIZES) {
    await tour(browser, size);
    await journey(browser, size);
  }
  await desktopStatus(browser);
  server.kill();
  await new Promise((r) => setTimeout(r, 800));

  const built = spawnSync(process.execPath, [vite, 'build', '--outDir', 'dist-http'], {
    cwd: root,
    stdio: 'ignore',
    // A port nothing listens on, so the app shows its error state even if a real back end runs on 8765.
    env: { ...process.env, VITE_KALAN_MOCK: '', VITE_KALAN_API: 'http://127.0.0.1:9' },
  });
  if (built.status !== 0) throw new Error('HTTP build for the error shots failed');
  server = preview('dist-http');
  await waitForServer();
  await errorShots(browser);

  console.log(overflow.join('\n'));
  console.log(`saved to ${outDir}`);
} finally {
  await browser?.close();
  server?.kill();
  rmSync(join(root, 'dist-http'), { recursive: true, force: true });
  rmSync(join(root, 'dist-full'), { recursive: true, force: true });
}
