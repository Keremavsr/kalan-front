import {
  ApiError,
  type ApiErrorBody,
  type ExportFile,
  type KalanApi,
  type Statement,
  type UploadResult,
} from './types';

export const PASSWORD_REMEMBERED_HEADER = 'X-Kalan-Password-Remembered';
export const SKIPPED_ROWS_HEADER = 'X-Kalan-Skipped-Rows';

const EXPORT_EXTENSIONS = { hledger: 'journal', beancount: 'beancount', ofx: 'ofx', csv: 'csv' } as const;

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

function parseJson(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

type QueryValue = string | number | boolean | null | undefined;

/** `?a=1&b=x` from the defined values only; empty string when none. */
export function queryString(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

const seg = (value: string) => encodeURIComponent(value);

function filenameOf(disposition: string | null): string | null {
  if (!disposition) return null;
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  return match ? decodeURIComponent(match[1]!) : null;
}

interface FormOptions {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

interface RawResponse {
  status: number;
  text: string;
  header: (name: string) => string | null;
}

export function createHttpApi(baseUrl: string, fetchImpl: typeof fetch = fetch.bind(globalThis)): KalanApi {
  const base = baseUrl.replace(/\/+$/, '');

  async function send(method: string, path: string, init: { json?: unknown; accept?: string } = {}): Promise<RawResponse> {
    const headers: Record<string, string> = { Accept: init.accept ?? 'application/json' };
    if (init.json !== undefined) headers['Content-Type'] = 'application/json';
    let response: Response;
    try {
      response = await fetchImpl(`${base}${path}`, {
        method,
        headers,
        body: init.json === undefined ? undefined : JSON.stringify(init.json),
      });
    } catch {
      throw new ApiError(0, 'network', 'The local back end did not answer.');
    }
    const text = response.status === 204 ? '' : await response.text();
    if (!response.ok) throw toApiError(response.status, parseJson(text));
    return { status: response.status, text, header: (name) => response.headers.get(name) };
  }

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const raw = await send(method, path, { json: body });
    if (raw.status === 204 || !raw.text) return undefined as T;
    const parsed = parseJson(raw.text);
    if (parsed === undefined) throw new ApiError(raw.status, 'invalid_response', 'The back end answered with invalid JSON.');
    return parsed as T;
  }

  /**
   * Multipart POST. With `onProgress` it goes through XMLHttpRequest (upload progress events),
   * otherwise through fetch.
   */
  async function postForm(path: string, form: FormData, options: FormOptions = {}): Promise<RawResponse> {
    if (options.signal?.aborted) throw new ApiError(0, 'aborted', 'Upload cancelled.');
    if (!options.onProgress || typeof XMLHttpRequest === 'undefined') {
      let response: Response;
      try {
        response = await fetchImpl(`${base}${path}`, {
          method: 'POST',
          headers: { Accept: 'application/json' },
          body: form,
          signal: options.signal,
        });
      } catch {
        if (options.signal?.aborted) throw new ApiError(0, 'aborted', 'Upload cancelled.');
        throw new ApiError(0, 'network', 'The local back end did not answer.');
      }
      const text = await response.text();
      if (!response.ok) throw toApiError(response.status, parseJson(text));
      return { status: response.status, text, header: (name) => response.headers.get(name) };
    }
    const onProgress = options.onProgress;
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${base}${path}`);
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(event.loaded / event.total);
      };
      xhr.onerror = () => reject(new ApiError(0, 'network', 'The local back end did not answer.'));
      xhr.onabort = () => reject(new ApiError(0, 'aborted', 'Upload cancelled.'));
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({ status: xhr.status, text: xhr.responseText, header: (name) => xhr.getResponseHeader(name) });
        } else reject(toApiError(xhr.status, parseJson(xhr.responseText)));
      };
      options.signal?.addEventListener('abort', () => xhr.abort());
      xhr.send(form);
    });
  }

  function jsonOf<T>(raw: RawResponse): T {
    const parsed = parseJson(raw.text);
    if (parsed === undefined) throw new ApiError(raw.status, 'invalid_response', 'The back end answered with invalid JSON.');
    return parsed as T;
  }

  async function uploadStatementDetailed(file: File, options: Parameters<KalanApi['uploadStatement']>[1] = {}): Promise<UploadResult> {
    const form = new FormData();
    form.append('file', file);
    if (options.password) form.append('password', options.password);
    if (options.rememberPassword !== undefined) form.append('remember_password', String(options.rememberPassword));
    const query = queryString({ ai_fallback: options.aiFallback });
    const raw = await postForm(`/statements${query}`, form, options);
    const remembered = raw.header(PASSWORD_REMEMBERED_HEADER);
    return {
      statement: jsonOf<Statement>(raw),
      passwordRemembered: remembered === null ? null : remembered.toLowerCase() === 'true',
    };
  }

  return {
    health: () => request('GET', '/health'),
    getProviders: () => request('GET', '/providers'),
    selectProvider: (id) => request('PUT', '/providers/selected', { id }),
    getSettings: () => request('GET', '/settings'),
    putSettings: (settings) => request('PUT', '/settings', settings),

    uploadStatement: async (file, options) => (await uploadStatementDetailed(file, options)).statement,
    uploadStatementDetailed,
    listStatements: () => request('GET', '/statements'),
    getStatement: (id) => request('GET', `/statements/${seg(id)}`),
    deleteStatement: (id) => request('DELETE', `/statements/${seg(id)}`),
    createTemplateDraft: (id) => request('POST', `/statements/${seg(id)}/template-draft`),
    getPdfPasswords: () => request('GET', '/pdf-passwords'),
    putPdfPassword: (bank, password) => request('PUT', `/pdf-passwords/${seg(bank)}`, { password }),
    deletePdfPassword: (bank) => request('DELETE', `/pdf-passwords/${seg(bank)}`),

    getCategoryRules: () => request('GET', '/category-rules'),
    createCategoryRule: (body) => request('POST', '/category-rules', body),
    deleteCategoryRule: (id) => request('DELETE', `/category-rules/${seg(id)}`),
    diagnose: async (file, options = {}) => {
      const form = new FormData();
      form.append('file', file);
      if (options.password) form.append('password', options.password);
      return jsonOf(await postForm('/diagnose', form, options));
    },

    importFile: async (file, options = {}) => {
      const form = new FormData();
      form.append('file', file);
      if (options.format) form.append('format', options.format);
      if (options.mapping) form.append('mapping', JSON.stringify(options.mapping));
      return jsonOf(await postForm('/imports', form, options));
    },
    listImports: () => request('GET', '/imports'),
    deleteImport: (id) => request('DELETE', `/imports/${seg(id)}`),

    createTransaction: (body) => request('POST', '/transactions', body),
    listTransactions: (filter = {}) => request('GET', `/transactions${queryString({ month: filter.month, source: filter.source })}`),
    deleteTransaction: (id) => request('DELETE', `/transactions/${seg(id)}`),

    createFixedCost: (body) => request('POST', '/fixed-costs', body),
    listFixedCosts: () => request('GET', '/fixed-costs'),
    deleteFixedCost: (id) => request('DELETE', `/fixed-costs/${seg(id)}`),

    getSchedule: (months) => request('GET', `/installments/schedule${queryString({ months })}`),
    getMonthlySummary: (month) => request('GET', `/summary/monthly${queryString({ month })}`),
    getSubscriptions: () => request('GET', '/subscriptions'),
    simulateInstallment: (body) => request('POST', '/simulate/installment', body),
    getAlerts: () => request('GET', '/alerts'),

    analyzeStatement: (id) => request('POST', `/statements/${seg(id)}/analyze`),
    getJob: (jobId) => request('GET', `/jobs/${seg(jobId)}`),
    getAnalysis: (id) => request('GET', `/statements/${seg(id)}/analysis`),
    startAnalysisAll: () => request('POST', '/analysis/all'),
    getAnalysisAll: () => request('GET', '/analysis/all'),

    listCards: () => request('GET', '/cards'),
    renameCard: (id, name) => request('PUT', `/cards/${seg(id)}`, { name }),
    closePlan: (planId) => request('POST', `/plans/${seg(planId)}/close`),
    reopenPlan: (planId) => request('DELETE', `/plans/${seg(planId)}/close`),
    setSubscriptionExpected: (id, amount) => request('PUT', `/subscriptions/${seg(id)}/expected`, { amount }),
    clearSubscriptionExpected: (id) => request('DELETE', `/subscriptions/${seg(id)}/expected`),
    getSuggestions: (locale) => request('GET', `/suggestions${queryString({ locale })}`),
    getFrequentPlaces: (months) => request('GET', `/insights/frequent-places${queryString({ months })}`),

    getInsightRules: () => request('GET', '/insights/rules'),
    putInsightRules: (overrides) => request('PUT', '/insights/rules', overrides),
    getMinimumPayment: (query = {}) =>
      request(
        'GET',
        `/insights/minimum-payment${queryString({
          statement_id: query.statement_id,
          include_installments: query.include_installments,
          cycles: query.cycles,
        })}`,
      ),
    listCardFees: () => request('GET', '/insights/card-fees'),
    getCardFeePrompt: (id) => request('GET', `/insights/card-fees/${seg(id)}/prompt`),
    draftCardFeeLetter: (id) => request('POST', `/insights/card-fees/${seg(id)}/draft`),
    getWhichCard: (date) => request('GET', `/insights/which-card${queryString({ date })}`),
    getShareCard: (query = {}) => request('GET', `/insights/share-card${queryString({ locale: query.locale, amounts: query.amounts })}`),
    getShareCardSvg: async (query = {}) =>
      (
        await send('GET', `/insights/share-card.svg${queryString({ locale: query.locale, amounts: query.amounts })}`, {
          accept: 'image/svg+xml',
        })
      ).text,
    getForecast: (includeFixed) => request('GET', `/insights/forecast${queryString({ include_fixed: includeFixed })}`),
    getForecastBacktest: (query = {}) =>
      request(
        'GET',
        `/insights/forecast/backtest${queryString({
          include_fixed: query.include_fixed,
          history: query.history,
          min_history: query.min_history,
        })}`,
      ),
    getEarlyPayoffOverview: () => request('GET', '/insights/early-payoff'),
    getEarlyPayoff: (planId, month) => request('GET', `/insights/early-payoff/${seg(planId)}${queryString({ month })}`),
    listCancelledSubscriptions: () => request('GET', '/insights/cancelled-subscriptions'),
    addCancelledSubscription: (body) => request('POST', '/insights/cancelled-subscriptions', body),
    deleteCancelledSubscription: (merchant) => request('DELETE', `/insights/cancelled-subscriptions${queryString({ merchant })}`),
    getFixedCostMatches: () => request('GET', '/insights/fixed-costs/matches'),
    exportData: async (query): Promise<ExportFile> => {
      const what = query.what ?? 'transactions';
      const raw = await send('GET', `/insights/export${queryString({ format: query.format, what: query.what, currency: query.currency })}`, {
        accept: '*/*',
      });
      const skipped = raw.header(SKIPPED_ROWS_HEADER);
      return {
        text: raw.text,
        filename: filenameOf(raw.header('Content-Disposition')) ?? `kalan-${what}.${EXPORT_EXTENSIONS[query.format]}`,
        contentType: raw.header('Content-Type') ?? 'text/plain',
        skippedRows: skipped === null || skipped === '' ? null : Number(skipped),
      };
    },
  };
}
