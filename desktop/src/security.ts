/** Content Security Policy and navigation rules for the desktop shell. */

export const APP_SCHEME = 'app';
export const APP_HOST = 'kalan';
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

export interface CspInput {
  /** Port of the local back end, or null in mock mode (no API traffic). */
  apiPort: number | null;
  /** Vite dev server origin in development; it needs inline scripts and styles for HMR. */
  devOrigin?: string | null;
}

export function buildCsp({ apiPort, devOrigin }: CspInput): string {
  const connect = ["'self'"];
  if (apiPort !== null) connect.push(`http://127.0.0.1:${apiPort}`);
  const dev = devOrigin ?? null;
  if (dev) connect.push(dev.replace(/^http/, 'ws'));
  const inline = dev ? " 'unsafe-inline'" : '';
  return [
    "default-src 'none'",
    `script-src 'self'${inline}`,
    `style-src 'self'${inline}`,
    "img-src 'self' data:",
    "font-src 'self' data:",
    `connect-src ${connect.join(' ')}`,
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "worker-src 'none'",
  ].join('; ');
}

/** Pages the window may show: the bundled app and status page, and the Vite dev server in development. */
export function isAppUrl(url: string, devOrigin: string | null): boolean {
  let origin: string;
  try {
    const parsed = new URL(url);
    origin = parsed.protocol === `${APP_SCHEME}:` ? `${parsed.protocol}//${parsed.host}` : parsed.origin;
  } catch {
    return false;
  }
  return origin === APP_ORIGIN || (devOrigin !== null && origin === devOrigin);
}

/** Links that may leave the app: they open in the system browser, never inside the window. */
export function isExternalUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:' || protocol === 'mailto:';
  } catch {
    return false;
  }
}
