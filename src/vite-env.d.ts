/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_KALAN_MOCK?: string;
  readonly VITE_KALAN_API?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
