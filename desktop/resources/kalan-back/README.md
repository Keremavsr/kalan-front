# Bundled back end slot

Packaged builds start the back end from `resources/kalan-back/kalan.exe` (Windows) or `resources/kalan-back/kalan`
(macOS, Linux). The binary is built by the back repo with PyInstaller and is not committed here.

Copy a built binary into this folder before `npm run desktop:build`:

    node scripts/fetch-back.mjs <path-to-built-kalan-binary>

electron-builder copies this folder to `<app>/resources/kalan-back/`. If the slot is empty the app still builds, but
the packaged app shows the "back end stopped" screen on start.
