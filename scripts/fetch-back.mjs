// Puts the back end executable (the one-file PyInstaller build of the back repo) into the desktop resource
// slot desktop/resources/kalan-back/kalan[.exe].
//
//   npm run desktop:fetch-back                       newest GitHub Release of the back repo, this platform
//   npm run desktop:fetch-back -- --tag v0.2.0       a given release
//   npm run desktop:fetch-back -- --platform linux-x64
//   npm run desktop:fetch-back -- path/to/kalan.exe  a local build (dist/kalan.exe in the back repo)
//
// Release assets (see .github/workflows/release.yml in the back repo): kalan-back-windows-x64.exe,
// kalan-back-macos-arm64, kalan-back-linux-x64 and SHA256SUMS.txt. A download is used only when its
// SHA-256 matches SHA256SUMS.txt of the same release. KALAN_BACK_REPO overrides the repo (owner/name);
// KALAN_BACK_BASE_URL replaces the whole release download URL (a mirror, or a local folder server in tests).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = process.env.KALAN_BACK_REPO || 'Keremavsr/kalan-back';
const ASSETS = {
  'win32-x64': 'kalan-back-windows-x64.exe',
  'darwin-arm64': 'kalan-back-macos-arm64',
  'linux-x64': 'kalan-back-linux-x64',
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const slot = path.join(root, 'desktop', 'resources', 'kalan-back');

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

function parseArgs(argv) {
  const opts = { tag: null, platform: `${process.platform}-${process.arch}`, source: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--tag') opts.tag = argv[++i];
    else if (a === '--platform') opts.platform = argv[++i];
    else if (a === '-h' || a === '--help') fail('usage: node scripts/fetch-back.mjs [--tag vX.Y.Z] [--platform win32-x64|darwin-arm64|linux-x64] [path-to-local-build]', 0);
    else if (a.startsWith('-')) fail(`unknown option: ${a}`, 2);
    else opts.source = a;
  }
  if ((opts.tag === undefined) || (opts.platform === undefined)) fail('--tag and --platform need a value', 2);
  return opts;
}

function install(bytes, platform) {
  const name = platform.startsWith('win32') ? 'kalan.exe' : 'kalan';
  const target = path.join(slot, name);
  fs.mkdirSync(slot, { recursive: true });
  fs.writeFileSync(target, bytes);
  if (!platform.startsWith('win32')) fs.chmodSync(target, 0o755);
  return target;
}

async function download(url) {
  const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'kalan-fetch-back' } });
  if (!res.ok) fail(`download failed: ${url} (HTTP ${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

async function fromRelease(tag, platform) {
  const asset = ASSETS[platform];
  if (!asset) fail(`no release build for ${platform}; build the back end locally and pass its path`);
  const base = process.env.KALAN_BACK_BASE_URL?.replace(/\/$/, '') || (tag
    ? `https://github.com/${REPO}/releases/download/${encodeURIComponent(tag)}`
    : `https://github.com/${REPO}/releases/latest/download`);
  const sums = (await download(`${base}/SHA256SUMS.txt`)).toString('utf8');
  const line = sums.split(/\r?\n/).find((l) => l.trim().split(/\s+\*?/).pop() === asset);
  if (!line) fail(`${asset} is not listed in SHA256SUMS.txt of ${tag ?? 'the latest release'}`);
  const expected = line.trim().split(/\s+/)[0].toLowerCase();
  const bytes = await download(`${base}/${asset}`);
  const actual = crypto.createHash('sha256').update(bytes).digest('hex');
  if (actual !== expected) fail(`checksum mismatch for ${asset}: expected ${expected}, got ${actual}`);
  return { bytes, label: `${REPO} ${tag ?? 'latest'} ${asset} (sha256 ok)` };
}

const opts = parseArgs(process.argv.slice(2));
let bytes;
let label;
if (opts.source) {
  if (!fs.statSync(opts.source, { throwIfNoEntry: false })?.isFile()) fail(`not a file: ${opts.source}`);
  bytes = fs.readFileSync(opts.source);
  label = opts.source;
} else {
  ({ bytes, label } = await fromRelease(opts.tag, opts.platform));
}
const target = install(bytes, opts.platform);
console.log(`copied ${label} -> ${path.relative(root, target)}`);
