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

## Desktop app (Electron)

The desktop app is the same front end in an Electron window. On start it launches the back end as a
child process on 127.0.0.1 and passes its URL to the page as `window.kalan.apiBase`. No cloud server.

```sh
npm run desktop:dev        # Vite + Electron; starts `kalan serve --port 0 --print-port` from PATH
npm run desktop:dev:mock   # same with demo data, no back end
npm run desktop:build      # Windows NSIS installer (unsigned) in release/
```

- Back end command in development: `kalan` from PATH, or `KALAN_BACK_CMD`
  (for example `KALAN_BACK_CMD=../back/.venv/Scripts/kalan.exe`). The back end prints
  `{"event":"ready","port":N}` when it listens; an older back end without `--print-port` is started on
  port 8765 and polled at `/health`.
- Packaged builds run `resources/kalan-back/kalan(.exe)`, a PyInstaller binary from the back repo. Copy it into
  `desktop/resources/kalan-back/` with `npm run desktop:fetch-back -- <path>` before `desktop:build`.
- If the back end stops, the window shows its exit and the last 20 stderr lines with a Restart button.
- `KALAN_DESKTOP_SMOKE=1` runs the app hidden, prints one `KALAN_SMOKE {...}` line once the page has rendered
  and quits (exit code 0 on success). `KALAN_DESKTOP_SMOKE_SHOT=<file.png>` also saves a screenshot.
- Security: context isolation, sandbox, no Node in the page, strict CSP, pages served from `app://kalan/`,
  web links open in the system browser. mac (dmg) and Linux (AppImage, deb) targets are configured in
  `desktop/electron-builder.yml` but not built yet.

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
- `desktop/src`: Electron main process, sidecar, preload; `desktop/static`: start and error page.
- `src/i18n/locales`: `tr` and `en` complete; `pt` and `es` have every key, waiting for text.

## Licence

MIT
