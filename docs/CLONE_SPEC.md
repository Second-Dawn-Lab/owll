# Owl-L Behavioral Spec (clean-room, from a reference translator)

**Method.** Black-box only. A reference Windows desktop translator (free tier, not logged in) was driven through its UI and observed through screenshots. No code, binaries or network traffic were inspected. No assets, strings, icons or branding are copied; the wording below is our own.

**Tags.** **[O]** = OBSERVED directly. **[I]** = INFERRED (from hints, tooltips or common behavior).

**Scope of observation.** Observed: main window (Text, Write, Images, Files, History tabs), main menu, all five Settings pages, language pickers, translation, word alternatives, the options side panel, and the screen-capture overlay (opening and Esc cancel). Not observed: Ctrl+C+C popup, floating icon, tray icon, file translation (needs an account), result of a completed capture, multi-monitor. These are listed in section 10.

Local footprint **[O]**: the app is installed per-user under `%LOCALAPPDATA%` and keeps a browser-engine cache in a `%LOCALAPPDATA%` subfolder (UI engine cache only, purpose not otherwise confirmed). Translation history is stored locally and encrypted, per the settings text **[O]**.

---

## 1. Feature inventory

| Group | Feature | Tag |
|---|---|---|
| **Text translation** | Two side-by-side panes: source (left), result (right) | O |
| | Translates live while typing (no Translate button) | O |
| | Source language is on automatic detection by default; after typing it shows the detected language name with a "detected" marker | O |
| | Target language picker with search box; ~100+ languages in a two-column list, alphabetical | O |
| | Swap-languages button between the pickers | O |
| | Clear (×) button in source pane | O |
| | Copy buttons on both panes | O |
| | Listen (text-to-speech) button on source pane | O |
| | Share button on result pane | O |
| | Undo / redo buttons in the footer | O |
| | Font-size ("AA"), voice dictation and on-screen keyboard buttons in the footer | O |
| | Banner with dismiss (×) that promotes the paid tier | O |
| | Side panel ("Toolbar") toggled by a button: Formality, Style profiles, Glossaries, Style rules (all but Glossaries marked paid-only) | O |
| **Alternatives / word suggestions** | Clicking a word or phrase in the result opens a small popup with two tabs: **Alternatives** (list of rephrasings, e.g. 4 options) and **Dictionary** | O |
| | A collapsible dictionary-entries bar under the panes | O |
| **Write (rewrite)** | Separate tab: paste text, get improvement ideas; click a word for alternatives or to rephrase a sentence | O |
| **Images tab** | Pick a language pair, drag-and-drop an image, an upload button, a capture-text-from-screen button, a help link | O |
| **Screen-area selection** | Dim overlay, drag an area, hint card (see section 4) | O (open and cancel), I (result) |
| **Document translation** | Files tab: PDF, Word (.docx), PowerPoint (.pptx) (and .xlsx shown in the illustration). Locked behind an account in the free tier | O |
| **Ctrl+C+C popup** | Select text anywhere, press the shortcut, a small floating window (or the main app) shows the translation | I (setting text and onboarding hint seen; popup itself not triggered) |
| **Floating icon** | Optional icon that appears below selected text in other apps | I (setting text seen) |
| **Rewrite shortcut** | Shortcut that sends selected text to Write | O (setting seen) |
| **History** | Chronological list; each item shows languages, character counts, source text, result text, age ("just now"), per-item delete, "Clear history" | O |
| **Settings** | See section 6 | O |
| **Menu** | Account card, Settings, update check, help and how-it-works entries, share, About, privacy information, Exit | O |
| **Tray / background** | App can keep running in the background so shortcuts work; closing asks what to do | O (setting), I (tray icon) |
| **Startup** | Option to launch with Windows | O |
| **Glossary** | Toggle in side panel (needs account to define) | O (toggle), U (editor) |
| **Formality** | Formal/informal control, paid-only in reference | O (locked) |

## 2. Screens and states

| Screen | Contents | States |
|---|---|---|
| **Main window, Text tab** | Tab bar (Text, Write, Images, Files, History), account buttons (right), info banner, language bar, two panes, alternatives bar, footer | **Empty:** placeholder inviting typing or pasting, hint about the shortcut, a file drag-and-drop zone, capture icon. **Typing/done:** result appears about 1 s after typing stops; language shows "(detected)". **Alternatives open:** popup anchored to the clicked word. **Panel open:** panes narrow, side panel on the right. **Language picker open:** search + two-column list; selected item has a check mark |
| **Language picker** | Search field, list; source list starts with an automatic-detection entry | closed, open, filtered |
| **Write tab** | Two panes, empty placeholder, footer | empty (typed state not observed, U) |
| **Images tab** | Language pair row, drop zone, upload button, capture button, help link, first-use tooltip about the capture shortcut | empty |
| **Files tab (free, logged out)** | Explanation + sign-up prompt; language bar greyed out | locked |
| **History tab** | List of cards, clear button, footer note about retention limits for paid | empty (U), one entry |
| **Settings window** | Left nav (General, Keyboard shortcuts, Accessibility, Files & translation, Advanced), content on right | per page |
| **Capture overlay** | Full-screen dim, top-left hint card | open; result U |
| **Floating popup (Ctrl+C+C)** | Small window near cursor | not observed (U) |
| **Offline/error state** | Not observed (the reference needs internet) | U |

## 3. Interaction flows

1. **Translate text.** Open app, click the left pane, type or paste. After a short pause the right pane fills in. Source language auto-detected and shown.
2. **Switch target language.** Click target picker, type in search or scroll, click a language. Result re-translates immediately.
3. **Swap direction.** Click swap button. Detected source becomes target, old target becomes source, and the old result becomes the new input. Button is disabled while source is on auto-detect with empty input.
4. **See alternatives.** Click a word in the result. A popup lists alternative phrasings; picking one replaces that phrase.
5. **Ctrl+C+C from a browser (I).** Select text in any app, press Ctrl twice-C (or Ctrl+C then C quickly), the quick-access window opens near the screen, showing source and result. Where it opens is set by the "Quick access" setting (small floating window or main app).
6. **Area selection (O/I).** Press the capture shortcut (or the capture button). Screen dims, hint card appears. User drags a rectangle; the recognized text is translated and shown (exact UI of result is U).
7. **Drag in a .docx (I).** Files tab, drop file, pick target language, translate, save via a dialog or a default folder (setting "Download location").
8. **Clear.** × in source pane empties both panes.
9. **History.** Tab opens list; delete one or clear all.

## 4. Area selection in detail

| Aspect | Observed behavior | Tag |
|---|---|---|
| Trigger | Button in Images tab and a button in the source pane; plus a global shortcut (default Ctrl+F8, off by default) | O |
| Overlay | Whole screen dimmed (dark with a warm tint), hint card top-left with a short title, a cancel instruction and a line naming the enabled languages | O |
| Cancel | Esc closes the overlay and returns to the app | O |
| Languages | Limited to a small set (up to three) chosen in settings; default shown as one language plus the app language | O |
| Free-tier limit | Source-pane capture shows a tooltip about enabling capture for specific languages | O |
| Result placement | Translation shown inside the app | I |
| Multi-monitor | Not tested | U |
| No text found | Not tested | U |

## 5. Hotkeys

| Action | Default | Enabled by default | Configurable | Tag |
|---|---|---|---|---|
| Translate selected text or files | Ctrl + C C (double press) | Yes | Yes, modifiers (Ctrl, Alt, Shift, Win) plus one key; reset-to-default button | O |
| Rewrite selected text | Ctrl + Win + C | Yes | Yes | O |
| Capture an area of the screen | Ctrl + F8 | **No** | Yes | O |
| Cancel capture | Esc | n/a | No | O |

## 6. Settings (with defaults)

| Page | Option | Default |
|---|---|---|
| General | Launch automatically at device start | On |
| | Floating icon below selected text | Off |
| | Quick access opens in: small floating window / main app | Small floating window |
| | Ignore quick access when no text selected | Off |
| | On closing: keep in background / quit / ask | Ask each time |
| Keyboard shortcuts | Three shortcuts above | see section 5 |
| Accessibility | UI language | Default (system) |
| | Theme: Light / Dark / Sync with Windows | Sync with Windows |
| Files & translation | Download location: ask each time / fixed folder | Ask each time |
| | Keep translation history (stored locally, encrypted) | On |
| | Capture languages (up to 3) | English + one |
| Advanced | Block list: apps that should not react to shortcuts | Empty |
| | Proxy on/off, proxy credentials | Off |
| | Reset all settings | n/a |

## 7. Edge cases and errors

| Case | Observed | Tag |
|---|---|---|
| Empty input | Placeholder shown, no result, swap/clear inactive | O |
| Character count limit | Not found in the free tier UI; counts are shown in History | U |
| Mixed-language text | Single language detected for the whole text | I |
| Unsupported file type | Not tested | U |
| No text in capture | Not tested | U |
| Offline | Not tested | U |
| History limit | Free tier keeps history, paid note mentions long retention | O |

## 8. Owl-L adaptation

| Feature | Decision | Owl-L notes |
|---|---|---|
| Two-pane live translation | **KEEP** | Offline, debounce about 300 ms |
| Auto language detect | **ADAPT** | Small local detector; same "(detected)" label |
| Language picker with search | **ADAPT** | List only shows installed packs; others show a download badge |
| Swap, clear, copy, undo/redo | **KEEP** | |
| Listen (TTS) | **ADAPT** | Use Windows system voices; optional, post-MVP |
| Dictation, on-screen keyboard | **DROP** | Out of scope |
| Click-word alternatives | **ADAPT** | N-best from the local model |
| Dictionary tab | **ADAPT** | Post-MVP; optional dictionary pack |
| Write (rewrite) | **ADAPT** | Quality mode via local LLM (llama.cpp), post-MVP |
| Formality, style profiles, style rules | **DROP** (MVP) | Possibly formal/informal for supported pairs later |
| Glossary | **ADAPT** | Local glossary file applied after translation, post-MVP |
| Ctrl+C+C popup | **KEEP** | Same defaults; configurable (`dawn-hotkeys`) |
| Floating icon | **KEEP** (optional) | Off by default |
| Quick access: popup vs main window | **KEEP** | |
| Area selection | **ADAPT** | `dawn-capture` + OCR: Windows OCR first, RapidOCR fallback (`dawn-ocr`) |
| Images tab (upload image) | **ADAPT** | Same OCR path |
| Document translation | **ADAPT** | Local; .docx, .pptx, .xlsx, .txt, .pdf (text PDFs). No account limit |
| History | **KEEP** | Local, off-switch, clear, per-item delete; encrypt at rest optional |
| Tray icon, run in background, launch at start | **KEEP** | |
| Settings pages | **KEEP** | Same five groups; add Language packs page |
| Theme, UI language | **KEEP** | Via `@seconddawn/ui`, `@seconddawn/i18n` |
| Block list (apps ignoring hotkeys) | **KEEP** | |
| Proxy settings | **ADAPT** | Only used for downloading packs |
| Account, sign-up, upgrade banners, share, help center | **DROP** | No accounts, no ads |
| Check for updates | **ADAPT** | Through Nest (`@seconddawn/updater`) |
| Offline badge, privacy indicator | **ADD** | Always-visible "Offline" chip; shows that nothing leaves the device |
| Language pack manager | **ADD** | Install/remove packs, size, license, attribution |
| Shared Second Dawn model store | **ADD** | `%AppData%/SecondDawn/models`, listed in `models/catalog.json` |
| Pivot through English | **ADD** | For missing pairs; label result as "via English" |
| Engine choice (fast vs quality) | **ADD** | Opus-MT / Bergamot via CTranslate2 (`dawn-translate`); optional local LLM |

## 9. Acceptance tests

1. With a pack for EN→DE installed and the network disabled, typing in the left pane produces a translation in the right pane within 2 s.
2. Source language shows "(detected)" after typing text in a supported language with source set to auto.
3. Changing the target language re-translates without retyping.
4. Swap moves languages and text correctly; disabled when input is empty and source is auto.
5. × clears both panes; undo restores them.
6. Copy buttons copy exactly the pane text.
7. Clicking a word in the result opens alternatives; choosing one updates the result.
8. Language picker has search, shows installed vs downloadable packs, and downloads a pack with progress, verifying its checksum.
9. For a pair with no direct pack but both packs to/from English installed, translation works and is marked "via English".
10. Ctrl+C+C with text selected in another app opens the quick-access view with the translation (configurable to open the main window).
11. Quick-access setting "ignore when no text selected" is honored.
12. Shortcuts can be changed, disabled and reset to default; conflicts are reported.
13. Capture shortcut is off by default; when on, it dims the screen, shows a hint card, and Esc cancels with no side effect.
14. Dragging a rectangle runs OCR and shows the translated text; the OCR text is also viewable.
15. Capturing an area with no text shows a clear "no text found" message.
16. Capture works on a second monitor and across different DPI scales.
17. Dragging a .docx, .pptx or .xlsx translates it and saves per the download-location setting; unsupported types show a clear error.
18. History records each translation, can delete one or clear all, and can be turned off; nothing is recorded when off.
19. Launch-at-start, close behavior (background/quit/ask) and theme settings persist across restarts.
20. A visible indicator confirms that no network request is made during translation.
21. Empty input shows the placeholder and no error.
22. Very long text is split and translated without freezing the UI, with a progress state.

## 10. UNKNOWN (not confirmed by observation)

- Ctrl+C+C popup layout, timing window between presses, and behavior in different apps.
- Floating icon appearance and behavior.
- What happens after a completed capture (where the result appears, no-text case, multi-monitor, high-DPI).
- Tray icon, its menu, and what closing the window does (the close dialog was not triggered).
- File translation flow, size and page limits, supported types in detail, progress and error UI (locked without an account).
- Character limit and long-text behavior.
- Offline, rate-limit and error messages.
- Write tab output (rewrite UI, modes).
- Glossary editor and formality UI.
- Typing speed vs. translation delay (about 1 s observed, not measured).
- Whether dropped text or a dropped file is accepted in the Text tab drop zone.
