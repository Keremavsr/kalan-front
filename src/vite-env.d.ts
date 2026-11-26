/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_KALAN_MOCK?: string;
  readonly VITE_KALAN_API?: string;
  /** `full` starts the mock with every scenario stored (dev:mock:full). */
  readonly VITE_KALAN_MOCK_PRESET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Set by the desktop shell's preload (desktop/src/preload.cts); absent in the plain web build. */
interface KalanDesktopBridge {
  readonly desktop: true;
  /** URL of the local back end started by the desktop app, or null in mock mode. */
  readonly apiBase: string | null;
  /** Opens the folder of the renderer error log in the system file manager. */
  readonly openLogs?: () => Promise<void>;
}

interface Window {
  readonly kalan?: KalanDesktopBridge;
}
