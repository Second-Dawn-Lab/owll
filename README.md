

<p align="center">
  <img src="assets/brand/Owl-L_app_icon.png" alt="Owl-L" width="128" />
</p>

<h1 align="center">Owl-L</h1>
<p align="center"><b>A free, offline, private translator for your desktop.</b></p>

## What is Owl-L?

Owl-L is a free, open-source translator for Windows that works on your own computer. You type or paste text, translate selected text in any program with **Ctrl+C+C**, draw a box around text on the screen (images, videos, locked PDFs), or translate whole Word, PowerPoint, Excel and PDF files. The translation models run locally, so once you have installed a language pack, Owl-L works without internet. No account, no subscription, no tracking: your text and screenshots never leave your machine.

Owl-L is made by [Second Dawn](https://github.com/Second-Dawn-Lab) and licensed under the MIT license.

## Features

- Two-pane translation with automatic language detection
- **Documents**: translate Word, PowerPoint, Excel, text, Markdown and PDF files (a PDF becomes a Word document) on your computer, keeping the formatting
- **Word alternatives**: click a word of the translation to choose another one; the rest of the sentence follows
- **Glossary**: terms that must be translated your way, with CSV import and export
- **Quality mode** (optional, off by default): a small language model on your computer polishes the translation, sets formal or informal tone, inflects glossary terms, suggests better word alternatives, polishes documents and powers the **Write** tab (improve, shorten, change the register, fix grammar)
- Downloadable **language packs**: install only the languages you need
- **Ctrl+C+C** to translate selected text from any app (popup next to the pointer)
- **Area selection**: draw a box anywhere on screen and translate the text inside (images, videos, locked PDFs)
- Local history, tray icon, starts with your system (optional)
- Light and dark theme, UI in English and German

## Privacy and offline use

Once a language pack is installed, translation runs fully on your device. This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it.

- **No telemetry, no accounts, no analytics, no crash reports.** Owl-L never sends your text, screenshots, files or history anywhere.
- **What does leave your machine, and when:**
  - *Language pack and dictionary downloads*: only when you install a pack, a plain download from [Hugging Face](https://huggingface.co/Second-Dawn-Lab/owll-language-packs) (checked against a checksum). Hugging Face sees the usual connection data (your IP address and the file you ask for).
  - *Quality mode downloads* (optional, off by default): only when you turn Quality mode on and press Download, a plain download of the small `llama-server` program and one language model from [Hugging Face](https://huggingface.co/Second-Dawn-Lab/owll-quality-packs) (exact copies of the authors' files; if that fails, the authors' own repositories, e.g. the llama.cpp release on GitHub), each checked against a checksum.
  - *Update checks*: at most once a day at startup, and when you click "Check for updates", Owl-L downloads a small file (`latest.json`) from this repository's latest GitHub release. The new installer is downloaded only if you click "Update and restart". GitHub sees the usual connection data.
- **Quality mode keeps your text on this computer too.** The language model runs in a `llama-server` program that Owl-L starts on a port of this computer, or in an Ollama you already run on this computer. Owl-L refuses any address that is not `127.0.0.1`, `localhost` or `[::1]`. The model is loaded only when needed and freed after a few idle minutes.
- Everything else (translation, text recognition, history, settings) stays on your computer. History can be turned off or cleared in the app.

## Download

Download the Windows installer (`Owl-L_x.y.z_x64-setup.exe`) from **[GitHub Releases](https://github.com/Second-Dawn-Lab/owll/releases/latest)**, run it, and follow the steps. Windows 10 and 11 (64-bit). On first start Owl-L offers a short welcome where you choose your languages.

Installed copies check for a new version at most once a day and offer to update; see [Privacy](#privacy-and-offline-use).

### Windows may warn you

Until the installer is code-signed (see [Code signing policy](#code-signing-policy)), Windows SmartScreen may show **"Windows protected your PC"** or "Unknown publisher" when you run it. This is expected for new, small apps. To continue, click **More info**, then **Run anyway**. The installer on the Releases page is built there from the source code in this repository.

## Code signing policy

Free code signing provided by [SignPath.io](https://signpath.io), certificate by [SignPath Foundation](https://signpath.org). Only installers and programs built by this repository's Release workflow on GitHub Actions are signed, and every signing request is approved manually. See the full [code signing policy](docs/CODE_SIGNING_POLICY.md).

## Uninstall

Windows **Settings, Apps, Installed apps**, find **Owl-L**, **Uninstall**. The uninstaller asks whether to also delete Owl-L's own settings and translation history (`%AppData%\SecondDawn\owll`). It always keeps the downloaded language and model packs in `%AppData%\SecondDawn\models`, because other Second Dawn apps may use them; delete that folder yourself to free the space. Owl-L stores nothing else on your computer and has no account to close.

## Build from source

You need Node.js 20+, [pnpm](https://pnpm.io), Rust (stable), the [Tauri prerequisites](https://tauri.app/start/prerequisites/), Visual Studio Build Tools (Desktop development with C++) and [CMake](https://cmake.org/download/) 3.18+. The first build compiles the translation engine and takes about 13 minutes. Owl-L needs the shared [`dawn-core`](https://github.com/Second-Dawn-Lab/dawn-core) repository **next to** this folder:

```bash
git clone https://github.com/Second-Dawn-Lab/dawn-core
git clone https://github.com/Second-Dawn-Lab/owll
cd dawn-core && pnpm install
cd ../owll && pnpm install
pnpm tauri build    # the installer is written to target/release/bundle/nsis/
```

More (running in development mode, checks, tests) is under [For developers](#for-developers). Official releases are built by the [Release workflow](.github/workflows/release.yml) from a tagged commit and a pinned `dawn-core` version.

## Contributing and security

See [CONTRIBUTING](https://github.com/Second-Dawn-Lab/.github/blob/main/CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md). To report a vulnerability, follow [SECURITY.md](SECURITY.md).

## Screenshots

_Screenshots will be added here._

## Credits

Owl-L stands on the shoulders of **OPUS-MT (Helsinki-NLP)**, **CTranslate2**,and **Tauri** . Full model attributions are in the app's About screen. Owl-L is an independent project and is not affiliated with DeepL.

MIT licensed. See [LICENSE](LICENSE).

---

## For developers

### Status

| Works | Planned |
|---|---|
| Two-pane live translation with CTranslate2 (Opus-MT) | Drag-and-drop document translation |
| Language packs: download, cancel, resume, verify, remove, repair | Optional GPU use for Quality mode |
| English as the hub; other pairs go through English | Hosted Quality mode packs |
| Language detection among installed languages | |
| Ctrl+C+C popup, area selection with Windows OCR | |
| Local history, tray icon, settings, single instance | |
| Quality mode: polish, tone, glossary grammar, alternatives, Write tab | |

### Prerequisites

- Node.js 20+, [pnpm](https://pnpm.io), Rust (stable) and the [Tauri prerequisites](https://tauri.app/start/prerequisites/)
- **Windows:** the translation engine ([CTranslate2](https://github.com/OpenNMT/CTranslate2) with oneDNN) is compiled from source on the first build (about 13 minutes, a few GB of RAM). You need Visual Studio Build Tools (Desktop development with C++) and [CMake](https://cmake.org/download/) 3.18+ on your `PATH`. The static C runtime is set in [`.cargo/config.toml`](.cargo/config.toml).

### Get the code

Owl-L uses the shared code in [`dawn-core`](https://github.com/Second-Dawn-Lab/dawn-core), which must sit **next to** this folder:

```text
SecondDawn/
  dawn-core/
  owll/        <- this repo
```

```bash
git clone https://github.com/Second-Dawn-Lab/dawn-core
git clone https://github.com/Second-Dawn-Lab/owll
cd dawn-core && pnpm install      # the shared packages need their own dependencies
cd ../owll && pnpm install
```

Rust crates are path dependencies (`../dawn-core/crates/...`) and the TypeScript packages are `link:` dependencies (`../dawn-core/packages/...`), so edits in `dawn-core` show up here immediately, including hot reload in `tauri dev`.

### Run and build

```bash
pnpm tauri dev      # or run-owll.bat on Windows
pnpm build          # frontend only (the Tauri crate needs ./dist to exist)
pnpm tauri build    # installer
pnpm dev            # UI alone in a browser with a mock backend (src/ipc.mock.ts); add ?window=settings
```

The app starts with only English. Open **Language packs** (menu → Language packs) and download a language. Until the packs are hosted, build them locally: see `dawn-core/docs/models.md` and `dawn-core/tools/convert-models`.

### Checks and tests

```bash
pnpm lint
pnpm typecheck
cargo check --workspace
cargo test --workspace                                                      # unit tests
cargo test -p dawn-translate --test integration -- --ignored --nocapture    # needs converted de + ur models
```

### Updating dawn-core

CI and releases check out the `dawn-core` commit or tag named in [`dawn-core.ref`](dawn-core.ref), so builds are reproducible. To move to a newer `dawn-core`: test locally against it, then put its commit SHA or tag in `dawn-core.ref` and commit that together with any changes the new version needs. Never release with `main` in that file.

### Layout

```text
src/             React UI (talks to Rust only through src/ipc.ts)
src-tauri/src/   commands.rs (the API), settings.rs, history.rs, tray.rs, quick.rs, capture.rs, ocr.rs, quality.rs (Quality mode)
docs/            CLONE_SPEC.md (behavioral spec), quick-access.md, manual-tests-v0.4.md, ur-ja-models.md, releasing.md (releases, updater keys, signing)
assets/brand/    Owl-L app icon, Second Dawn logo and icon
dawn-core.ref    pinned dawn-core version for CI and releases
```

<p align="center">
  <br />
  <sub>by</sub><br />
  <img src="assets/brand/second-dawn-main.png" alt="Second Dawn" width="200" />
</p>
