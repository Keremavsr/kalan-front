import {
  ApiError,
  type ApiErrorBody,
  type KalanApi,
  type Statement,
  type UploadOptions,
} from './types';

function isErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as ApiErrorBody).error?.code === 'string'
  );
}

function toApiError(status: number, body: unknown): ApiError {
  if (isErrorBody(body)) {
    return new ApiError(status, body.error.code, body.error.message, body.error.details ?? {});
  }
  return new ApiError(status, 'http_error', `HTTP ${status}`);
}

export function createHttpApi(baseUrl: string, fetchImpl: typeof fetch = fetch.bind(globalThis)): KalanApi {
  const base = baseUrl.replace(/\/+$/, '');

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetchImpl(`${base}${path}`, {
        method,
        headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, 'network', 'The local back end did not answer.');
    }
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    const parsed: unknown = text ? JSON.parse(text) : undefined;
    if (!response.ok) throw toApiError(response.status, parsed);
    return parsed as T;
  }

  function upload(file: File, options: UploadOptions = {}): Promise<Statement> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${base}/statements`);
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) options.onProgress?.(event.loaded / event.total);
      };
      xhr.onerror = () => reject(new ApiError(0, 'network', 'The local back end did not answer.'));
      xhr.onabort = () => reject(new ApiError(0, 'aborted', 'Upload cancelled.'));
      xhr.onload = () => {
        let parsed: unknown;
        try {
          parsed = xhr.responseText ? JSON.parse(xhr.responseText) : undefined;
        } catch {
          parsed = undefined;
        }
        if (xhr.status >= 200 && xhr.status < 300) resolve(parsed as Statement);
        else reject(toApiError(xhr.status, parsed));
      };
      options.signal?.addEventListener('abort', () => xhr.abort());
      const form = new FormData();
      form.append('file', file);
      xhr.send(form);
    });
  }

  return {
    health: () => request('GET', '/health'),
    getProviders: () => request('GET', '/providers'),
    selectProvider: (id) => request('PUT', '/providers/selected', { id }),
    getSettings: () => request('GET', '/settings'),
    putSettings: (settings) => request('PUT', '/settings', settings),
    uploadStatement: upload,
    listStatements: () => request('GET', '/statements'),
    getStatement: (id) => request('GET', `/statements/${encodeURIComponent(id)}`),
    deleteStatement: (id) => request('DELETE', `/statements/${encodeURIComponent(id)}`),
    createTransaction: (body) => request('POST', '/transactions', body),
    deleteTransaction: (id) => request('DELETE', `/transactions/${encodeURIComponent(id)}`),
    getSchedule: (months) => request('GET', `/installments/schedule?months=${months}`),
    getMonthlySummary: (month) => request('GET', `/summary/monthly?month=${encodeURIComponent(month)}`),
    getSubscriptions: () => request('GET', '/subscriptions'),
    analyzeStatement: (id) => request('POST', `/statements/${encodeURIComponent(id)}/analyze`),
    getJob: (jobId) => request('GET', `/jobs/${encodeURIComponent(jobId)}`),
    getAnalysis: (id) => request('GET', `/statements/${encodeURIComponent(id)}/analysis`),
  };
}
