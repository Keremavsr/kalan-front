// Test setup. The DOM part (jest-dom matchers, i18n, jsdom shims) loads only in jsdom files, so a file
// marked `// @vitest-environment node` (the back end integration test) runs without a document.
if (typeof document !== 'undefined') await import('./setup-dom');
export {};
