import { describe, expect, it } from 'vitest';
import { buildCsp, isAppUrl, isExternalUrl } from './security.js';
import { fitToDisplays, parseWindowState } from './window-state.js';

describe('CSP', () => {
  it('allows only bundled code and the local back end in production', () => {
    const csp = buildCsp({ apiPort: 51234 });
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'self';");
    expect(csp).toContain('connect-src \'self\' http://127.0.0.1:51234;');
    expect(csp).not.toContain('unsafe');
  });

  it('allows Vite HMR only in development', () => {
    const csp = buildCsp({ apiPort: null, devOrigin: 'http://127.0.0.1:5173' });
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("connect-src 'self' ws://127.0.0.1:5173;");
  });
});

describe('navigation rules', () => {
  it('keeps the window on the app and the dev server', () => {
    expect(isAppUrl('app://kalan/plans', null)).toBe(true);
    expect(isAppUrl('http://127.0.0.1:5173/month', 'http://127.0.0.1:5173')).toBe(true);
    expect(isAppUrl('http://127.0.0.1:5173/month', null)).toBe(false);
    expect(isAppUrl('https://example.com/', 'http://127.0.0.1:5173')).toBe(false);
    expect(isAppUrl('app://evil/', null)).toBe(false);
    expect(isAppUrl('file:///C:/x.html', null)).toBe(false);
  });

  it('opens only web and mail links outside', () => {
    expect(isExternalUrl('https://example.com')).toBe(true);
    expect(isExternalUrl('mailto:a@example.com')).toBe(true);
    expect(isExternalUrl('file:///C:/Windows/notepad.exe')).toBe(false);
    expect(isExternalUrl('javascript:alert(1)')).toBe(false);
  });
});

describe('window state', () => {
  const display = { x: 0, y: 0, width: 1920, height: 1040 };

  it('restores a saved window that is still on screen', () => {
    const state = parseWindowState('{"bounds":{"x":100,"y":80,"width":1400,"height":900},"maximized":true}');
    expect(state).toEqual({ bounds: { x: 100, y: 80, width: 1400, height: 900 }, maximized: true });
    expect(fitToDisplays(state, [display])).toEqual({ x: 100, y: 80, width: 1400, height: 900 });
  });

  it('drops the position of a window left on a removed display and ignores bad files', () => {
    const state = parseWindowState('{"bounds":{"x":2500,"y":80,"width":300,"height":200}}');
    expect(fitToDisplays(state, [display])).toEqual({ width: 900, height: 600 });
    expect(parseWindowState('not json')).toBeNull();
    expect(fitToDisplays(null, [display])).toEqual({ width: 1280, height: 820 });
  });
});
