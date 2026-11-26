# Contributing

Two kinds of help move kalan forward the most: a template for your bank and a translation.

Whatever you send, never include a real statement, a screenshot of one, or text copied from it. Test data in this
repository is invented.

## Add your bank

Banks are taught in the engine's repository, [kalan-back](https://github.com/Keremavsr/kalan-back). Most layouts fit a
short YAML template, no Python: [docs/adding-a-bank.md](https://github.com/Keremavsr/kalan-back/blob/main/docs/adding-a-bank.md).
If you cannot write one, open a [Bank not supported](https://github.com/Keremavsr/kalan-back/issues/new?template=bank-not-supported.yml)
issue with the app's anonymous layout report.

## Translate the app

Each language is a folder of JSON files, one per screen: `src/i18n/locales/<lang>/<area>.json`.

- To fix a translation, edit the value. Keep the keys and the `{{placeholders}}` as they are.
- To add a language, copy `src/i18n/locales/en` to the new code (for example `de`), translate the values, then add the
  code to `LANGUAGES` in `src/i18n/resources.ts`, its Intl locale to `INTL_LOCALE` in `src/i18n/index.ts` and its
  name to `LANGUAGE_NAMES` in `src/features/settings/SettingsPage.tsx`.
- Example amounts in the copy are always the invented `1.234,56` (or `1,234.56`).

`npm test` checks that every language has the same files and keys. Then open a pull request; one language per pull
request is easiest to review.

## Code changes

Open an issue first for anything bigger than a fix, so we agree on it before you spend time. Run
`npm run lint && npm run typecheck && npm test` before the pull request. [docs/development.md](docs/development.md)
explains the setup.
