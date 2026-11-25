/**
 * kalan desktop main process.
 *
 * Starts the back end as a sidecar on 127.0.0.1, then shows the web front end in a locked-down window
 * (context isolation, sandbox, no Node in the renderer, strict CSP, no remote content). The renderer gets the
 * back end URL from the preload as `window.kalan.apiBase`. Packaged builds serve the renderer from `app://kalan/`;
 * `npm run desktop:dev` points the window at the Vite dev server through `ELECTRON_RENDERER_URL`.
 */
import { app, BrowserWindow, ipcMain, Menu, net, protocol, screen, session, shell } from 'electron';
import type { IpcMainEvent, IpcMainInvokeEvent, MenuItemConstructorOptions } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { APP_HOST, APP_ORIGIN, APP_SCHEME, buildCsp, isAppUrl, isExternalUrl } from './security.js';
import { resolveBackCommand, Sidecar } from './sidecar.js';
import { fitToDisplays, MIN_SIZE, WindowStateStore } from './window-state.js';

interface DesktopStatus {
  state: 'starting' | 'ready' | 'error';
  message: string | null;
  stderr: string[];
}

const here = path.dirname(fileURLToPath(import.meta.url));
const rendererRoot = path.join(here, '..', '..', 'dist');
const staticRoot = path.join(here, '..', 'static');
const preloadPath = path.join(here, 'preload.cjs');
const STATUS_URL = `${APP_ORIGIN}/__desktop/status.html`;

const devUrl = app.isPackaged ? null : (process.env.ELECTRON_RENDERER_URL ?? null);
const devOrigin = devUrl ? new URL(devUrl).origin : null;
const rendererUrl = devUrl ?? `${APP_ORIGIN}/`;
const mock = !app.isPackaged && process.env.VITE_KALAN_MOCK === '1';
const smoke = process.env.KALAN_DESKTOP_SMOKE === '1';

let win: BrowserWindow | null = null;
let sidecar: Sidecar | null = null;
let apiPort: number | null = null;
let status: DesktopStatus = { state: 'starting', message: null, stderr: [] };
let quitting = false;
let readyToQuit = false;

protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

app.setAppUserModelId('io.github.kalan');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      if (isExternalUrl(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });
    const guard = (event: Electron.Event, url: string) => {
      if (isAppUrl(url, devOrigin)) return;
      event.preventDefault();
      if (isExternalUrl(url)) void shell.openExternal(url);
    };
    contents.on('will-navigate', guard);
    contents.on('will-redirect', guard);
    contents.on('will-attach-webview', (event) => event.preventDefault());
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', (event) => {
    if (readyToQuit) return;
    event.preventDefault();
    if (quitting) return;
    quitting = true;
    void stopBackend().finally(() => {
      readyToQuit = true;
      app.quit();
    });
  });
  void app.whenReady().then(onReady);
}

function onReady(): void {
  registerAppProtocol();
  hardenSession();
  ipcMain.on('kalan:api-base', (event: IpcMainEvent) => {
    event.returnValue = trusted(event) && apiPort !== null ? `http://127.0.0.1:${apiPort}` : null;
  });
  ipcMain.handle('kalan:status', (event: IpcMainInvokeEvent) => (trusted(event) ? status : null));
  ipcMain.handle('kalan:restart', async (event: IpcMainInvokeEvent) => {
    if (trusted(event) && status.state === 'error') await bootBackend();
  });
  Menu.setApplicationMenu(buildMenu());
  createWindow();
  void bootBackend();
}

function trusted(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url;
  return typeof url === 'string' && isAppUrl(url, devOrigin);
}

function csp(): string {
  return buildCsp({ apiPort: mock ? null : apiPort, devOrigin });
}

/** Serves `dist/` (with SPA fallback for the router) and the status page under `app://kalan/`. */
function registerAppProtocol(): void {
  protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url);
    if (url.host !== APP_HOST) return new Response('Not found', { status: 404 });
    let pathname = decodeURIComponent(url.pathname);
    let root = rendererRoot;
    if (pathname.startsWith('/__desktop/')) {
      root = staticRoot;
      pathname = pathname.slice('/__desktop'.length);
    }
    let file = path.normalize(path.join(root, pathname));
    if (file !== root && !file.startsWith(root + path.sep)) return new Response('Not found', { status: 404 });
    if (!isFile(file)) {
      if (root !== rendererRoot || path.extname(pathname)) return new Response('Not found', { status: 404 });
      file = path.join(rendererRoot, 'index.html');
    }
    const res = await net.fetch(pathToFileURL(file).toString());
    const headers = new Headers(res.headers);
    headers.set('Content-Security-Policy', csp());
    headers.set('X-Content-Type-Options', 'nosniff');
    return new Response(res.body, { status: res.status, headers });
  });
}

function isFile(file: string): boolean {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

function hardenSession(): void {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
  if (devOrigin) {
    ses.webRequest.onHeadersReceived({ urls: [`${devOrigin}/*`] }, (details, callback) => {
      callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp()] } });
    });
  }
}

function buildMenu(): Menu | null {
  const template: MenuItemConstructorOptions[] = [];
  if (process.platform === 'darwin') template.push({ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' });
  if (!app.isPackaged) {
    template.push({ label: 'Dev', submenu: [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }] });
  }
  return template.length > 0 ? Menu.buildFromTemplate(template) : null;
}

function createWindow(): void {
  const store = new WindowStateStore(app.getPath('userData'));
  const saved = store.load();
  const bounds = fitToDisplays(saved, screen.getAllDisplays().map((d) => d.workArea));
  const window = new BrowserWindow({
    ...bounds,
    minWidth: MIN_SIZE.width,
    minHeight: MIN_SIZE.height,
    show: false,
    title: 'kalan',
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  });
  window.once('ready-to-show', () => {
    if (smoke) return;
    window.show();
    if (saved?.maximized) window.maximize();
  });
  window.on('close', () => {
    if (!smoke) store.save({ bounds: window.getNormalBounds(), maximized: window.isMaximized() });
  });
  window.on('closed', () => {
    win = null;
  });
  win = window;
}

function setStatus(next: DesktopStatus): void {
  status = next;
  win?.webContents.send('kalan:status', status);
}

async function showStatusPage(): Promise<void> {
  if (!win || win.webContents.getURL() === STATUS_URL) return;
  await win.loadURL(STATUS_URL).catch(() => undefined);
}

async function showRenderer(): Promise<void> {
  if (!win) return;
  await win.loadURL(rendererUrl);
  if (smoke) void runSmokeCheck();
}

function getSidecar(): Sidecar {
  if (sidecar) return sidecar;
  const { command, args } = resolveBackCommand({
    packaged: app.isPackaged,
    env: process.env,
    resourcesPath: process.resourcesPath,
    platform: process.platform,
  });
  const origin = devOrigin ?? APP_ORIGIN;
  sidecar = new Sidecar({ command, args, env: { ...process.env, KALAN_CORS_ORIGINS: origin } });
  sidecar.on('crash', (exit) => {
    apiPort = null;
    if (quitting) return;
    setStatus({ state: 'error', message: `back end stopped (exit ${exit.code ?? exit.signal ?? 'unknown'})`, stderr: exit.stderr });
    void showStatusPage().then(() => (smoke ? smokeStatusPage('back end crashed') : undefined));
  });
  return sidecar;
}

async function bootBackend(): Promise<void> {
  setStatus({ state: 'starting', message: null, stderr: [] });
  await showStatusPage();
  if (mock) {
    setStatus({ state: 'ready', message: null, stderr: [] });
    await showRenderer();
    return;
  }
  const backend = getSidecar();
  try {
    apiPort = await backend.start();
    setStatus({ state: 'ready', message: null, stderr: [] });
    await showRenderer();
  } catch (error) {
    apiPort = null;
    const message = error instanceof Error ? error.message : String(error);
    setStatus({ state: 'error', message, stderr: backend.stderrTail() });
    await showStatusPage();
    if (smoke) void smokeStatusPage(message);
  }
}

async function stopBackend(): Promise<void> {
  if (sidecar) await sidecar.stop();
}

/** `KALAN_DESKTOP_SMOKE=1`: wait for the React root to render, print one JSON line, quit (window stays hidden). */
async function runSmokeCheck(): Promise<void> {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline && win) {
    const rendered = (await win.webContents.executeJavaScript(
      `(() => { const root = document.getElementById('root'); return root ? root.childElementCount : 0; })()`,
    )) as number;
    if (rendered > 0) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const report = (await win.webContents.executeJavaScript(`(async () => {
        const k = window.kalan;
        let health = null;
        if (k && k.apiBase) { try { health = (await fetch(k.apiBase + '/health')).status; } catch (e) { health = 'blocked'; } }
        return { url: location.href, title: document.title, textLength: document.body.innerText.length,
                 headings: [...document.querySelectorAll('h1,h2')].slice(0, 3).map((h) => h.textContent),
                 apiBase: k ? k.apiBase : 'no preload', health };
      })()`)) as Record<string, unknown>;
      const shot = process.env.KALAN_DESKTOP_SMOKE_SHOT;
      if (shot) fs.writeFileSync(shot, (await win.webContents.capturePage()).toPNG());
      finishSmoke(0, report);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  finishSmoke(1, { error: 'renderer did not render within 20 s' });
}

/** Smoke run that hit the error screen: report what the status page shows, then fail. */
async function smokeStatusPage(error: string): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 500));
  const page = win ? ((await win.webContents.executeJavaScript('document.body.innerText')) as string) : '';
  finishSmoke(1, { error, statusPage: page });
}

function finishSmoke(code: number, report: Record<string, unknown>): void {
  process.stdout.write(`KALAN_SMOKE ${JSON.stringify({ ok: code === 0, ...report })}\n`);
  void stopBackend().finally(() => app.exit(code));
}
