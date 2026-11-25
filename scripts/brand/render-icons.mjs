// Renders the kalan app icon SVGs to PNG (16-512) for the desktop build, headless. ICO is packed by make_ico.py.
// Usage: node scripts/brand/render-icons.mjs
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('../..', import.meta.url));
const out = join(root, 'desktop', 'build', 'icons');
mkdirSync(out, { recursive: true });
const svg = (name) => readFileSync(join(root, 'src', 'assets', 'brand', name), 'utf8');

const browser = await chromium.launch({ headless: true });
try {
  for (const size of [16, 24, 32, 48, 64, 128, 256, 512]) {
    const source = size <= 32 ? svg('kalan-app-icon-small.svg') : svg('kalan-app-icon.svg');
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<html><body style="margin:0;background:transparent">${source.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`,
    );
    await page.screenshot({ path: join(out, `${size}x${size}.png`), omitBackground: true });
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(`saved to ${out}`);
