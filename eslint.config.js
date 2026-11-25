import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'playwright-report', 'test-results', 'release', 'desktop/dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    files: ['**/*.{ts,tsx,cts}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true, allowExportNames: ['buttonClass', 'controlClass', 'useMoneyFormatter', 'useToast', 'useApi', 'createQueryClient'] },
      ],
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['desktop/src/**/*.{ts,cts}'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['desktop/static/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.browser, sourceType: 'script' },
  },
);
