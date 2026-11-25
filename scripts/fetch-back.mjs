// Copies a built back end binary (PyInstaller output from the back repo) into the desktop resource slot.
// Usage: node scripts/fetch-back.mjs <path-to-kalan-or-kalan.exe>
// Stub for now: the back repo does not publish binaries yet, so the path must point at a local build.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const slot = path.join(root, 'desktop', 'resources', 'kalan-back');
const source = process.argv[2];

if (!source) {
  console.error('usage: node scripts/fetch-back.mjs <path-to-built-kalan-binary>');
  process.exit(2);
}
if (!fs.statSync(source, { throwIfNoEntry: false })?.isFile()) {
  console.error(`not a file: ${source}`);
  process.exit(1);
}

const name = process.platform === 'win32' ? 'kalan.exe' : 'kalan';
const target = path.join(slot, name);
fs.mkdirSync(slot, { recursive: true });
fs.copyFileSync(source, target);
if (process.platform !== 'win32') fs.chmodSync(target, 0o755);
console.log(`copied ${source} -> ${path.relative(root, target)}`);
