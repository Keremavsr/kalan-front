/* global window, document, PopStateEvent -- used inside page.evaluate callbacks, which run in the browser */
// README and GitHub artwork, drawn in code from the kalan tokens and the bundled font. Headless, nothing opens.
//   docs/screenshots/*.png         app screens on demo data (English UI, 1440x900 at 2x)
//   docs/brand/header-*.png        logo + one sentence, light and dark GitHub themes
//   docs/brand/download-*.png      "Download for Windows" pill, light and dark
//   docs/social-preview.png        1280x640, upload under Settings > Social preview
// With a path to the back repo it also writes that repo's header and social preview:
//   node scripts/brand/readme-art.mjs [../back]
// The kalan name and logo are not under the MIT licence (NOTICE). Demo data is invented.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('../..', import.meta.url));
const backDir = process.argv[2] ? resolve(process.argv[2]) : null;
const vite = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const port = process.env.KALAN_PREVIEW_PORT ?? 4318;
const base = `http://127.0.0.1:${port}`;
const tmp = mkdtempSync(join(tmpdir(), 'kalan-art-'));

// Colour roles, copied from src/styles/tokens.css. GitHub's own page colours are only used as the dark backdrop.
const C = {
  ground: '#ECECE6',
  groundAlt: '#E2E2DC',
  paper: '#FAFAFC',
  line: '#CCCCC2',
  ink: '#181B26',
  muted: '#515561',
  prusya: '#24476B',
  asi: '#C08A2B',
  kraplak: '#8C2F3E',
  toprak: '#4F6B4A',
  ghDark: '#0D1117',
  ghDarkMuted: '#9198A1',
};

const fontUrl = pathToFileURL(join(root, 'src/assets/fonts/BricolageGrotesque-sub.woff2')).href;
const wordmark = readFileSync(join(root, 'src/assets/brand/kalan-wordmark.svg'), 'utf8');
const logo = (color) => wordmark.replaceAll('#181B26', color).replace('<svg ', '<svg class="logo" ');

const css = `
@font-face { font-family: 'Bricolage Grotesque'; src: url('${fontUrl}') format('woff2'); font-weight: 200 800; font-stretch: 75% 100%; }
* { margin: 0; box-sizing: border-box; }
html, body { background: transparent; }
body { font-family: 'Bricolage Grotesque', sans-serif; font-variant-numeric: tabular-nums; -webkit-font-smoothing: antialiased; }
.display { font-variation-settings: 'opsz' 96, 'wdth' 75, 'wght' 800; letter-spacing: -0.02em; line-height: 1.02; }
.body { font-variation-settings: 'opsz' 14, 'wdth' 100, 'wght' 450; }
.strong { font-variation-settings: 'opsz' 14, 'wdth' 100, 'wght' 650; }
`;

async function render(browser, name, html, size, out, { transparent = true } = {}) {
  const file = join(tmp, `${name}.html`);
  writeFileSync(file, `<!doctype html><meta charset="utf-8"><style>${css}</style>${html}`, 'utf8');
  const page = await browser.newPage({ viewport: size, deviceScaleFactor: 2 });
  await page.goto(pathToFileURL(file).href);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  await page.screenshot({ path: out, omitBackground: transparent });
  await page.close();
}

// ---------- header: logo and one sentence ----------
function header(sentence, fg, sub) {
  return `
<style>
  .wrap { width: 1200px; height: 210px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 34px; }
  .logo { height: 78px; width: auto; }
  h1 { font-size: 46px; color: ${fg}; text-align: center; max-width: 980px; letter-spacing: 0; }
  p { font-size: 22px; color: ${sub}; }
</style>
<div class="wrap">${logo(fg)}<h1 class="display">${sentence}</h1></div>`;
}

// ---------- download pill (the site's primary button: ink pill, white circle with an arrow) ----------
function pill(label, fill, text, dot, arrow) {
  return `
<style>
  .b { display: inline-flex; align-items: center; gap: 20px; height: 64px; padding: 0 8px 0 30px; border-radius: 999px; background: ${fill}; }
  .b span { font-size: 22px; color: ${text}; }
  .d { width: 48px; height: 48px; border-radius: 999px; background: ${dot}; display: grid; place-items: center; }
  body { padding: 0; display: inline-block; }
</style>
<div class="b"><span class="strong">${label}</span><div class="d">
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${arrow}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>
</div></div>`;
}

// ---------- social preview, front: sentence on the left, a piece of the app on the right ----------
function socialFront(shot) {
  return `
<style>
  .s { width: 1280px; height: 640px; background: ${C.ground}; position: relative; overflow: hidden; }
  .left { position: absolute; left: 72px; top: 72px; width: 520px; display: flex; flex-direction: column; height: 496px; }
  .logo { height: 50px; width: auto; align-self: flex-start; }
  h1 { font-size: 60px; color: ${C.ink}; margin-top: auto; }
  p { font-size: 22px; color: ${C.muted}; margin-top: 26px; line-height: 1.45; }
  .card { position: absolute; left: 650px; top: 72px; width: 820px; height: 640px; border-radius: 14px; overflow: hidden;
          background: ${C.paper}; border: 1px solid ${C.line}; }
  /* The shot is 1440 CSS px wide; show it at 0.86 from x 110, y 70: title, sentence and the month chart. */
  .card img { width: 1238px; display: block; margin: -60px 0 0 -95px; }
</style>
<div class="s">
  <div class="left">${logo(C.ink)}
    <h1 class="display">Know what your credit cards will take from you, month by month.</h1>
    <p class="body">Free for Windows. Reads your card statements on your own computer, no account needed.</p>
  </div>
  <div class="card"><img src="${pathToFileURL(shot).href}"></div>
</div>`;
}

// ---------- social preview, back: sentence on the left, the coming months as stacked bars ----------
function socialBack() {
  // Invented plans, the site's stacked-bar language: flat ends, amount inside, muted caption under.
  const months = [
    ['Dec', [3600, 1800, 1500]],
    ['Jan', [3600, 1800, 1500]],
    ['Feb', [3600, 1800]],
    ['Mar', [3600, 1800]],
    ['Apr', [3600]],
    ['May', [3600]],
  ];
  const fills = [
    [C.prusya, C.paper],
    [C.asi, C.ink],
    [C.kraplak, C.paper],
  ];
  const max = 6900;
  const barW = 334; // bar column (340px) minus the two 2px gaps + spare
  const fmt = (n) => n.toLocaleString('de-DE') + ',00';
  const rows = months
    .map(([m, parts]) => {
      const segs = parts
        .map((v, i) => `<div class="seg" style="width:${Math.round((v / max) * barW)}px;background:${fills[i][0]};color:${fills[i][1]}">${fmt(v)}</div>`)
        .join('');
      const total = parts.reduce((a, b) => a + b, 0);
      return `<div class="row"><span class="m strong">${m}</span><div class="bar">${segs}</div><span class="t strong">${fmt(total)}</span></div>`;
    })
    .join('');
  return `
<style>
  .s { width: 1280px; height: 640px; background: ${C.ground}; position: relative; overflow: hidden; }
  .left { position: absolute; left: 72px; top: 72px; width: 500px; display: flex; flex-direction: column; height: 496px; }
  .logo { height: 50px; width: auto; align-self: flex-start; }
  h1 { font-size: 58px; color: ${C.ink}; margin-top: auto; }
  p { font-size: 22px; color: ${C.muted}; margin-top: 26px; line-height: 1.45; }
  .chart { position: absolute; left: 640px; top: 72px; width: 568px; height: 496px; background: ${C.paper}; border-radius: 14px;
           padding: 36px 36px 32px; display: flex; flex-direction: column; }
  .cap { font-size: 17px; color: ${C.muted}; }
  .head { font-size: 30px; color: ${C.ink}; margin: 6px 0 22px; }
  .row { display: grid; grid-template-columns: 40px 340px 1fr; align-items: center; gap: 12px; height: 46px; border-top: 1px solid ${C.line}; }
  .m { font-size: 17px; color: ${C.ink}; }
  .bar { display: flex; gap: 2px; height: 28px; }
  .seg { flex: none; height: 28px; font-size: 13px; display: flex; align-items: center; padding-left: 8px; white-space: nowrap; overflow: hidden; }
  .t { font-size: 17px; color: ${C.ink}; text-align: right; }
  .foot { margin-top: auto; font-size: 15px; color: ${C.muted}; border-top: 1px solid ${C.line}; padding-top: 12px; }
</style>
<div class="s">
  <div class="left">${logo(C.ink)}
    <h1 class="display">Reads card statements and works out every installment.</h1>
    <p class="body">The engine and command line behind kalan. Runs on your own computer.</p>
  </div>
  <div class="chart">
    <span class="cap body">kalan schedule -n 6</span>
    <span class="head display">Installments still to pay</span>
    ${rows}
    <span class="foot body">Three plans on one card. Example amounts.</span>
  </div>
</div>`;
}

// ---------- app screenshots on the full demo preset ----------
async function screenshots(browser) {
  const built = spawnSync(process.execPath, [vite, 'build', '--mode', 'mock', '--outDir', 'dist-readme'], {
    cwd: root,
    stdio: 'ignore',
    env: { ...process.env, VITE_KALAN_MOCK: '1', VITE_KALAN_MOCK_PRESET: 'full' },
  });
  if (built.status !== 0) throw new Error('mock build failed');
  const server = spawn(process.execPath, [vite, 'preview', '--outDir', 'dist-readme', '--port', String(port), '--strictPort'], {
    cwd: root,
    stdio: 'ignore',
  });
  try {
    for (let i = 0; i < 60; i += 1) {
      try {
        if ((await fetch(base)).ok) break;
      } catch {
        /* not up yet */
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    const dir = join(root, 'docs/screenshots');
    mkdirSync(dir, { recursive: true });
    const shots = [
      ['overview', '/'],
      ['installments', '/installments'],
      ['regular-payments', '/recurring'],
    ];
    // One page for every shot: the mock lives in memory, so moving with page.goto would reset it.
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
    await page.addInitScript(() => localStorage.setItem('kalan.tourSeen', '1'));
    const go = (p) =>
      page.evaluate((to) => {
        window.history.pushState({}, '', to);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }, p);
    await page.goto(base + '/settings');
    // The demo settings say Turkish; switch the interface to English like a user would.
    await page.locator('label', { hasText: /^English$/ }).click();
    // The demo has an AI tool selected, so a categorising run starts by itself; shots wait until it is over.
    await page.getByText('Categories and suggestions are updated.').waitFor({ timeout: 60_000 });
    for (const [name, path] of shots) {
      await go(path);
      await page.waitForTimeout(300);
      await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, { timeout: 20_000 });
      for (const b of await page.getByRole('button', { name: /dismiss notification/i }).all()) await b.click().catch(() => {});
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.mouse.move(0, 0);
      await page.waitForTimeout(800);
      // The overview stops above the month chart, so the hero image does not end on half a bar.
      const clip = name === 'overview' ? { x: 0, y: 0, width: 1440, height: 840 } : undefined;
      await page.screenshot({ path: join(dir, `${name}.png`), clip });
    }
    await page.close();
  } finally {
    server.kill();
    await new Promise((r) => setTimeout(r, 500));
    rmSync(join(root, 'dist-readme'), { recursive: true, force: true });
  }
}

const browser = await chromium.launch({ headless: true });
try {
  if (!process.env.KALAN_ART_SKIP_SHOTS) await screenshots(browser);
  const brand = join(root, 'docs/brand');
  mkdirSync(brand, { recursive: true });
  const sentence = 'Know what your credit cards will take from you, month by month.';
  await render(browser, 'h-light', header(sentence, C.ink, C.muted), { width: 1200, height: 210 }, join(brand, 'header-light.png'));
  await render(browser, 'h-dark', header(sentence, C.ground, C.ghDarkMuted), { width: 1200, height: 210 }, join(brand, 'header-dark.png'));
  await renderPill(browser, 'p-light', pill('Download for Windows', C.ink, C.paper, C.paper, C.ink), join(brand, 'download-light.png'));
  await renderPill(browser, 'p-dark', pill('Download for Windows', C.ground, C.ink, C.ink, C.ground), join(brand, 'download-dark.png'));
  await render(browser, 'social-front', socialFront(join(root, 'docs/screenshots/installments.png')), { width: 1280, height: 640 }, join(root, 'docs/social-preview.tmp.png'), { transparent: false });
  await downscale(browser, join(root, 'docs/social-preview.tmp.png'), join(root, 'docs/social-preview.png'));
  if (backDir) {
    const bb = join(backDir, 'docs/brand');
    mkdirSync(bb, { recursive: true });
    const s2 = 'The engine and command line of kalan.';
    await render(browser, 'hb-light', header(s2, C.ink, C.muted), { width: 1200, height: 210 }, join(bb, 'header-light.png'));
    await render(browser, 'hb-dark', header(s2, C.ground, C.ghDarkMuted), { width: 1200, height: 210 }, join(bb, 'header-dark.png'));
    await render(browser, 'social-back', socialBack(), { width: 1280, height: 640 }, join(backDir, 'docs/social-preview.tmp.png'), { transparent: false });
    await downscale(browser, join(backDir, 'docs/social-preview.tmp.png'), join(backDir, 'docs/social-preview.png'));
  }
  console.log('done');
} finally {
  await browser.close();
  rmSync(tmp, { recursive: true, force: true });
}

/** The pill is cut to its own size. */
async function renderPill(b, name, html, out) {
  const file = join(tmp, `${name}.html`);
  writeFileSync(file, `<!doctype html><meta charset="utf-8"><style>${css}</style>${html}`, 'utf8');
  const page = await b.newPage({ viewport: { width: 600, height: 120 }, deviceScaleFactor: 2 });
  await page.goto(pathToFileURL(file).href);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  await page.locator('.b').screenshot({ path: out, omitBackground: true });
  await page.close();
}

/** GitHub wants the social preview at 1280x640 exactly; the 2x render is scaled down in the browser. */
async function downscale(b, src, out) {
  const page = await b.newPage({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 1 });
  await page.setContent(`<style>*{margin:0}</style><img src="data:image/png;base64,${readFileSync(src).toString('base64')}" style="width:1280px;height:640px;display:block">`);
  await page.waitForTimeout(150);
  await page.screenshot({ path: out });
  await page.close();
  rmSync(src);
}
