// npm run desktop:dev: compiles the desktop main/preload, starts the Vite dev server, then runs Electron against it.
// Closing the Electron window stops Vite too; Ctrl+C stops both. VITE_KALAN_MOCK=1 skips the back end sidecar.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

function electronBinary() {
  let binary = require('electron');
  if (typeof binary !== 'string' || !fs.existsSync(binary)) {
    // npm may skip electron's postinstall download; fetch the binary once.
    spawnSync(process.execPath, [require.resolve('electron/install.js')], { stdio: 'inherit' });
    delete require.cache[require.resolve('electron')];
    binary = require('electron');
  }
  return binary;
}

const tsc = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', 'desktop/tsconfig.build.json'], {
  cwd: root,
  stdio: 'inherit',
});
if (tsc.status !== 0) process.exit(tsc.status ?? 1);

const server = await createServer({ root, server: { host: '127.0.0.1', port: 5173, strictPort: true } });
await server.listen();
const url = server.resolvedUrls?.local[0] ?? 'http://127.0.0.1:5173/';

const electron = spawn(electronBinary(), ['.'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RENDERER_URL: url },
});

let closing = false;
async function shutdown(code) {
  if (closing) return;
  closing = true;
  await server.close();
  process.exit(code);
}

electron.on('exit', (code) => void shutdown(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (electron.exitCode === null) electron.kill();
    else void shutdown(0);
  });
}
