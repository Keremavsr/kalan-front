import { createHttpApi } from './http';
import type { KalanApi } from './types';

export const DEFAULT_API_BASE = 'http://127.0.0.1:8765';

/**
 * Picks the mock adapter when VITE_KALAN_MOCK=1, otherwise the HTTP client. The mock is a separate chunk.
 * With VITE_KALAN_MOCK_PRESET=full the mock starts with every scenario stored (`npx cross-env VITE_KALAN_MOCK_PRESET=full npm run dev:mock`).
 * API base: the desktop shell's sidecar URL (window.kalan.apiBase), then VITE_KALAN_API, then the default port.
 */
export async function createApi(): Promise<KalanApi> {
  if (import.meta.env.VITE_KALAN_MOCK === '1') {
    const { createMockApi } = await import('./mock');
    // VITE_KALAN_MOCK_PRESET=full stores every scenario (second card, review, fixed costs, alerts); =empty stores nothing.
    const preset = (import.meta.env as Record<string, string | undefined>).VITE_KALAN_MOCK_PRESET;
    return createMockApi({ preset: preset === 'full' || preset === 'empty' ? preset : 'basic' });
  }
  const base = window.kalan?.apiBase || import.meta.env.VITE_KALAN_API || DEFAULT_API_BASE;
  return createHttpApi(base);
}
