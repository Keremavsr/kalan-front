import { render } from '@testing-library/react';
import { App, createQueryClient } from '../App';
import { createMockApi, type MockOptions } from '../api/mock';
import type { KalanApi } from '../api/types';

const invented = () => new File(['%PDF-1.4 invented'], 'ekstre-ekim.pdf', { type: 'application/pdf' });

/** Renders the whole app on the mock adapter. `uploaded` stores the October statement first. */
export async function renderApp(path: string, options: MockOptions & { uploaded?: boolean } = {}) {
  const { uploaded = false, ...mock } = options;
  const api: KalanApi = createMockApi({ latency: 0, uploadMs: 0, analysisMs: 30, ...mock });
  if (uploaded) await api.uploadStatement(invented());
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false, staleTime: 0, refetchOnWindowFocus: false } });
  const utils = render(<App api={api} queryClient={queryClient} initialPath={path} />);
  return { ...utils, api, queryClient };
}
