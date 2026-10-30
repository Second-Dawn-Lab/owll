# Changelog

All notable changes to Owl-L. The newest version is first. The text of a version's section is used
as the release notes and shown in the in-app update notice.

## [0.2.1](https://github.com/Second-Dawn-Lab/owll/compare/v0.2.0...v0.2.1) (2026-10-30)


### Features

* translate and edit documents with drafts ([a6f5920](https://github.com/Second-Dawn-Lab/owll/commit/a6f5920613e8fc5dc2f2afd4812e9f23301c561d))

## [0.2.0](https://github.com/Second-Dawn-Lab/owll/compare/v0.1.1...v0.2.0) (2026-10-30)


### Features

* Files tab target, glossary highlights, sentence alternatives and glossary page ([d379c4b](https://github.com/Second-Dawn-Lab/owll/commit/d379c4bad37d3ad956d35c9db7f9a8eda3cb6d57))
* Files tab, word alternatives, glossary page and capture improvements ([388d71c](https://github.com/Second-Dawn-Lab/owll/commit/388d71c3fd3bc289921b861933307521c6a79909))
* multi-file queue, named glossaries, alternatives panel, capture shortcut in text box ([1ee1c3f](https://github.com/Second-Dawn-Lab/owll/commit/1ee1c3f68ccabce7a0496a5d75ec01684f86836d))
* themed glossary tooltip, alternatives at the bottom and stacked glossary form ([c7cff23](https://github.com/Second-Dawn-Lab/owll/commit/c7cff232f247186e8fa4d1e576ab90564a736ded))

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
