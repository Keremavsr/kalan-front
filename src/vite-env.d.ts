/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_KALAN_MOCK?: string;
  readonly VITE_KALAN_API?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Set by the desktop shell's preload (desktop/src/preload.cts); absent in the plain web build. */
interface KalanDesktopBridge {
  readonly desktop: true;
  /** URL of the local back end started by the desktop app, or null in mock mode. */
  readonly apiBase: string | null;
}

interface Window {
  readonly kalan?: KalanDesktopBridge;
}
