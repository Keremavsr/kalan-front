import { describe, expect, it } from 'vitest';
import contract from '../../docs/api.md?raw';
import { createHttpApi } from './http';
import { createMockApi } from './mock';
import { ApiError, isApiError, type KalanApi } from './types';

// Every route the contract names, the client method that calls it, and a sample call.
// `X` stands for any path parameter.
type Call = (api: KalanApi) => Promise<unknown>;
const pdf = () => new File(['%PDF-1.4 invented'], 'ekstre.pdf', { type: 'application/pdf' });
const csv = () => new File(['date;description;amount\n2026-10-01;ORNEK;-1,00\n'], 'ornek.csv', { type: 'text/csv' });

const ENDPOINTS: Record<string, { method: keyof KalanApi; call: Call }> = {
  'GET /health': { method: 'health', call: (a) => a.health() },
  'GET /providers': { method: 'getProviders', call: (a) => a.getProviders() },
  'PUT /providers/selected': { method: 'selectProvider', call: (a) => a.selectProvider('claude-cli') },
  'GET /settings': { method: 'getSettings', call: (a) => a.getSettings() },
  'PUT /settings': { method: 'putSettings', call: (a) => a.putSettings({ locale: 'tr', base_currency: 'TRY', months_ahead: 12 }) },
  'POST /statements': { method: 'uploadStatementDetailed', call: (a) => a.uploadStatementDetailed(pdf()) },
  'POST /statements/{}/template-draft': { method: 'createTemplateDraft', call: (a) => a.createTemplateDraft('X') },
  'GET /pdf-passwords': { method: 'getPdfPasswords', call: (a) => a.getPdfPasswords() },
  'PUT /pdf-passwords/{}': { method: 'putPdfPassword', call: (a) => a.putPdfPassword('X', 'p') },
  'DELETE /pdf-passwords/{}': { method: 'deletePdfPassword', call: (a) => a.deletePdfPassword('X') },
  'GET /statements': { method: 'listStatements', call: (a) => a.listStatements() },
  'GET /statements/{}': { method: 'getStatement', call: (a) => a.getStatement('X') },
  'DELETE /statements/{}': { method: 'deleteStatement', call: (a) => a.deleteStatement('X') },
  'GET /category-rules': { method: 'getCategoryRules', call: (a) => a.getCategoryRules() },
  'POST /category-rules': { method: 'createCategoryRule', call: (a) => a.createCategoryRule({ pattern: 'ORNEK', category: 'dining' }) },
  'DELETE /category-rules/{}': { method: 'deleteCategoryRule', call: (a) => a.deleteCategoryRule('X') },
  'POST /diagnose': { method: 'diagnose', call: (a) => a.diagnose(pdf()) },
  'POST /imports': { method: 'importFile', call: (a) => a.importFile(csv()) },
  'GET /imports': { method: 'listImports', call: (a) => a.listImports() },
  'DELETE /imports/{}': { method: 'deleteImport', call: (a) => a.deleteImport('X') },
  'POST /transactions': {
    method: 'createTransaction',
    call: (a) => a.createTransaction({ date: '2026-10-01', description: 'ORNEK', amount: 100, currency: 'TRY', direction: 'debit', installment: null }),
  },
  'GET /transactions': { method: 'listTransactions', call: (a) => a.listTransactions({ month: '2026-09' }) },
  'DELETE /transactions/{}': { method: 'deleteTransaction', call: (a) => a.deleteTransaction('X') },
  'POST /fixed-costs': { method: 'createFixedCost', call: (a) => a.createFixedCost({ name: 'ORNEK', amount: 100, day: 1, start: '2026-01' }) },
  'GET /fixed-costs': { method: 'listFixedCosts', call: (a) => a.listFixedCosts() },
  'DELETE /fixed-costs/{}': { method: 'deleteFixedCost', call: (a) => a.deleteFixedCost('X') },
  'GET /installments/schedule': { method: 'getSchedule', call: (a) => a.getSchedule(12) },
  'GET /summary/monthly': { method: 'getMonthlySummary', call: (a) => a.getMonthlySummary('2026-09') },
  'GET /subscriptions': { method: 'getSubscriptions', call: (a) => a.getSubscriptions() },
  'POST /simulate/installment': { method: 'simulateInstallment', call: (a) => a.simulateInstallment({ amount: 120000, count: 6, start_month: '2026-12' }) },
  'GET /alerts': { method: 'getAlerts', call: (a) => a.getAlerts() },
  'POST /statements/{}/analyze': { method: 'analyzeStatement', call: (a) => a.analyzeStatement('X') },
  'GET /jobs/{}': { method: 'getJob', call: (a) => a.getJob('X') },
  'GET /statements/{}/analysis': { method: 'getAnalysis', call: (a) => a.getAnalysis('X') },
  'GET /insights/rules': { method: 'getInsightRules', call: (a) => a.getInsightRules() },
  'PUT /insights/rules': { method: 'putInsightRules', call: (a) => a.putInsightRules({ bsmv: '0.15' }) },
  'GET /insights/minimum-payment': { method: 'getMinimumPayment', call: (a) => a.getMinimumPayment({ cycles: 3 }) },
  'GET /insights/card-fees': { method: 'listCardFees', call: (a) => a.listCardFees() },
  'GET /insights/card-fees/{}/prompt': { method: 'getCardFeePrompt', call: (a) => a.getCardFeePrompt('X') },
  'POST /insights/card-fees/{}/draft': { method: 'draftCardFeeLetter', call: (a) => a.draftCardFeeLetter('X') },
  'GET /insights/which-card': { method: 'getWhichCard', call: (a) => a.getWhichCard('2026-11-01') },
  'GET /insights/share-card': { method: 'getShareCard', call: (a) => a.getShareCard({ locale: 'en' }) },
  'GET /insights/share-card.svg': { method: 'getShareCardSvg', call: (a) => a.getShareCardSvg() },
  'GET /insights/forecast': { method: 'getForecast', call: (a) => a.getForecast(false) },
  'GET /insights/forecast/backtest': { method: 'getForecastBacktest', call: (a) => a.getForecastBacktest({ history: 6 }) },
  'GET /insights/early-payoff': { method: 'getEarlyPayoffOverview', call: (a) => a.getEarlyPayoffOverview() },
  'GET /insights/early-payoff/{}': { method: 'getEarlyPayoff', call: (a) => a.getEarlyPayoff('X', '2026-12') },
  'GET /insights/cancelled-subscriptions': { method: 'listCancelledSubscriptions', call: (a) => a.listCancelledSubscriptions() },
  'POST /insights/cancelled-subscriptions': {
    method: 'addCancelledSubscription',
    call: (a) => a.addCancelledSubscription({ merchant: 'ORNEK', cancelled_on: '2026-10-01' }),
  },
  'DELETE /insights/cancelled-subscriptions': { method: 'deleteCancelledSubscription', call: (a) => a.deleteCancelledSubscription('ORNEK') },
  'GET /insights/fixed-costs/matches': { method: 'getFixedCostMatches', call: (a) => a.getFixedCostMatches() },
  'GET /insights/export': { method: 'exportData', call: (a) => a.exportData({ format: 'csv' }) },
  // v0.4.0
  'GET /cards': { method: 'listCards', call: (a) => a.listCards() },
  'PUT /cards/{}': { method: 'renameCard', call: (a) => a.renameCard('X', 'Market kartım') },
  'POST /plans/{}/close': { method: 'closePlan', call: (a) => a.closePlan('X') },
  'DELETE /plans/{}/close': { method: 'reopenPlan', call: (a) => a.reopenPlan('X') },
  'PUT /subscriptions/{}/expected': { method: 'setSubscriptionExpected', call: (a) => a.setSubscriptionExpected('X', 2999) },
  'DELETE /subscriptions/{}/expected': { method: 'clearSubscriptionExpected', call: (a) => a.clearSubscriptionExpected('X') },
  'GET /insights/frequent-places': { method: 'getFrequentPlaces', call: (a) => a.getFrequentPlaces(6) },
  'GET /suggestions': { method: 'getSuggestions', call: (a) => a.getSuggestions('tr') },
  'POST /analysis/all': { method: 'startAnalysisAll', call: (a) => a.startAnalysisAll() },
  'GET /analysis/all': { method: 'getAnalysisAll', call: (a) => a.getAnalysisAll() },
};

/** `METHOD /path` for every route in the contract text, path parameters as `{}`. */
function contractRoutes(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/`(GET|POST|PUT|DELETE) (\/[^`\s?]*)/g)) {
    found.add(`${match[1]} ${match[2]!.replace(/\{[^}]+\}/g, '{}')}`);
  }
  return [...found].sort();
}

interface Recorded {
  method: string;
  url: URL;
  body: unknown;
  headers: Record<string, string>;
}

function recordingFetch(answer: (req: Recorded) => Response = () => new Response('{}', { status: 200 })) {
  const calls: Recorded[] = [];
  const impl = ((input: string, init: RequestInit = {}) => {
    const req: Recorded = {
      method: init.method ?? 'GET',
      url: new URL(input),
      body: init.body,
      headers: (init.headers ?? {}) as Record<string, string>,
    };
    calls.push(req);
    return Promise.resolve(answer(req));
  }) as typeof fetch;
  return { calls, impl };
}

describe('contract coverage', () => {
  const routes = contractRoutes(contract);

  it('reads the v0.4.0 contract', () => {
    expect(contract).toMatch(/^# kalan API contract v0\.4\.0/);
    expect(routes.length).toBeGreaterThanOrEqual(50);
  });

  it('has a client method for every route in docs/api.md, and no stale entries', () => {
    expect(Object.keys(ENDPOINTS).sort()).toEqual(routes);
  });

  it('every listed method exists on the HTTP client and on the mock', () => {
    const http = createHttpApi('http://127.0.0.1:1');
    const mock = createMockApi({ latency: 0, uploadMs: 0 });
    for (const { method } of Object.values(ENDPOINTS)) {
      expect(typeof http[method], method).toBe('function');
      expect(typeof mock[method], method).toBe('function');
    }
    expect(Object.keys(http).sort()).toEqual(Object.keys(mock).sort());
  });

  for (const [route, entry] of Object.entries(ENDPOINTS)) {
    it(`${entry.method} calls ${route}`, async () => {
      const { calls, impl } = recordingFetch();
      await entry.call(createHttpApi('http://kalan.test/', impl)).catch(() => undefined);
      expect(calls).toHaveLength(1);
      const [method, path] = route.split(' ') as [string, string];
      const actual = calls[0]!.url.pathname.replace(/\/X(?=\/|$)/g, '/{}');
      expect(`${calls[0]!.method} ${actual}`).toBe(`${method} ${path}`);
    });
  }
});

describe('http client details', () => {
  const json = (body: unknown, init: ResponseInit = {}) =>
    new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' }, ...init });

  it('sends the upload password, remember flag and ai_fallback, and reads the remembered header', async () => {
    const { calls, impl } = recordingFetch(() =>
      json({ id: 'st_x' }, { status: 201, headers: { 'X-Kalan-Password-Remembered': 'true' } }),
    );
    const api = createHttpApi('http://kalan.test', impl);
    const result = await api.uploadStatementDetailed(pdf(), { password: '000000', rememberPassword: true, aiFallback: false });
    expect(result).toEqual({ statement: { id: 'st_x' }, passwordRemembered: true });
    expect(calls[0]!.url.search).toBe('?ai_fallback=false');
    const form = calls[0]!.body as FormData;
    expect(form.get('password')).toBe('000000');
    expect(form.get('remember_password')).toBe('true');
    expect(form.get('file')).toBeInstanceOf(File);
  });

  it('reports a missing remembered header as null and omits empty options', async () => {
    const { calls, impl } = recordingFetch(() => json({ id: 'st_x' }, { status: 201 }));
    const result = await createHttpApi('http://kalan.test', impl).uploadStatementDetailed(pdf());
    expect(result.passwordRemembered).toBeNull();
    expect(calls[0]!.url.search).toBe('');
    expect((calls[0]!.body as FormData).has('password')).toBe(false);
  });

  it('types save_blocked and password errors by code', async () => {
    const issues = [{ code: 'amount_scale', severity: 'hard', message: 'x', details: { factor: 100 } }];
    const { impl } = recordingFetch(() =>
      json({ error: { code: 'save_blocked', message: 'blocked', details: { issues } } }, { status: 422 }),
    );
    const error = await createHttpApi('http://kalan.test', impl).uploadStatement(pdf()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(isApiError(error, 'save_blocked')).toBe(true);
    if (isApiError(error, 'save_blocked')) expect(error.details.issues[0]!.code).toBe('amount_scale');
    expect(isApiError(error, 'duplicate')).toBe(false);
  });

  it('reads the export headers', async () => {
    const { calls, impl } = recordingFetch(
      () =>
        new Response('date,description\n', {
          status: 200,
          headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="kalan-plans.csv"', 'X-Kalan-Skipped-Rows': '2' },
        }),
    );
    const file = await createHttpApi('http://kalan.test', impl).exportData({ format: 'csv', what: 'plans', currency: 'USD' });
    expect(calls[0]!.url.search).toBe('?format=csv&what=plans&currency=USD');
    expect(file).toEqual({ text: 'date,description\n', filename: 'kalan-plans.csv', contentType: 'text/csv', skippedRows: 2 });
  });

  it('builds query strings from defined values only', async () => {
    const { calls, impl } = recordingFetch(() => json({}));
    const api = createHttpApi('http://kalan.test', impl);
    await api.getMinimumPayment({ statement_id: 'st 1', include_installments: true });
    await api.getForecast();
    await api.deleteCancelledSubscription('ORNEK MÜZİK').catch(() => undefined);
    expect(calls.map((c) => c.url.search)).toEqual([
      '?statement_id=st+1&include_installments=true',
      '',
      `?merchant=${encodeURIComponent('ORNEK MÜZİK').replace(/%20/g, '+')}`,
    ]);
  });

  it('answers a dead back end with the network code', async () => {
    const impl = (() => Promise.reject(new TypeError('fetch failed'))) as typeof fetch;
    await expect(createHttpApi('http://kalan.test', impl).getAlerts()).rejects.toMatchObject({ code: 'network', status: 0 });
  });
});
