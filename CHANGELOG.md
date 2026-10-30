# Changelog

All notable changes to Owl-L. The newest version is first. The text of a version's section is used
as the release notes and shown in the in-app update notice.

## [0.1.1](https://github.com/Second-Dawn-Lab/owll/compare/v0.1.0...v0.1.1) (2026-10-30)


### Bug Fixes

* v0.1.1 fixes and capture results in the main window ([cbc5b0d](https://github.com/Second-Dawn-Lab/owll/commit/cbc5b0d04d08024fa18c15ef39d67cdc11c21df6))

## [0.1.0] - 2026-10-30

First public release.

- Two-pane offline translation with automatic language detection, live while you type.
- Downloadable language packs (OPUS-MT, converted to CTranslate2 int8), hosted on Hugging Face and verified with a checksum; English is the hub, other pairs go through English.
- Ctrl+C+C quick popup next to the pointer, with copy, replace and "open in Owl-L".
- Area selection (Ctrl+Shift+O): draw a box anywhere on screen and translate the text inside, using Windows OCR.
- Local history, tray icon, optional start with Windows, light and dark theme, English and German interface.
- Automatic update check (at most once a day) and "Check for updates" in the menu and in Settings.
- First-run welcome: pick your languages and learn the shortcuts.
- No telemetry and no accounts. The only network access is downloading language packs and checking for updates.
