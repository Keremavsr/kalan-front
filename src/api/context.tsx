import { createContext, useContext, type ReactNode } from 'react';
import type { KalanApi } from './types';

const ApiContext = createContext<KalanApi | null>(null);

export function ApiProvider({ api, children }: { api: KalanApi; children: ReactNode }) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export function useApi(): KalanApi {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi must be used inside <ApiProvider>');
  return api;
}
