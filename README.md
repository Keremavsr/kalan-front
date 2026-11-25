# kalan-front

Web front end for **kalan**, a free, open source credit card tracker built around installments
(taksit, parcelado, meses sin intereses, cuotas). It answers one question well: how much of the
next 6 to 12 months is already committed, and what should you watch.

The front end talks to [kalan-back](../back) over HTTP only (`docs/api.md`). All amounts are
computed by the back end; the UI formats and presents them.

## Run

```sh
npm ci
npm run dev:mock   # demo data, no back end needed
npm run dev        # talks to VITE_KALAN_API (default http://127.0.0.1:8765)
```

Demo data is invented (card 0000, merchants such as MIGROS-ORNEK and STREAMFLIX). In mock mode,
uploading any PDF "reads" the October statement, which has a deliberate reconciliation mismatch;
a second upload returns `409 duplicate`, a file named `bilinmeyen.pdf` returns `422 unknown_format`.

## Check

```sh
npm run lint && npm run typecheck && npm test && npm run build
npm run test:e2e   # Playwright smoke test on the mock build
```

## Structure

- `src/styles/tokens.css`: every colour, font, radius, shadow and motion value. Change the look here only.
  Tailwind's default palette is switched off; a unit test fails if a raw colour appears elsewhere.
- `src/components/ui`: Button, Field, Modal, Card, Toast, Table, Money, Notice, Segmented.
- `src/api`: contract types, HTTP client, mock adapter (`VITE_KALAN_MOCK=1`), TanStack Query hooks.
- `src/features`: one folder per screen (calendar, month, subscriptions, watch, upload, setup, manual entry).
- `src/i18n/locales`: `tr` and `en` complete; `pt` and `es` have every key, waiting for text.

## Licence

MIT
