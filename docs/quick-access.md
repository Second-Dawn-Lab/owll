# Quick access (Ctrl+C+C)

Press the shortcut (default: Ctrl+C twice) with text selected in any app and Owl-L shows the translation in a small popup next to the pointer, or in the main window (Settings, General).

## How it works

1. **`dawn-hotkeys`** (from dawn-core, see its `docs/hotkeys.md`) installs a Windows low-level keyboard hook (`WH_KEYBOARD_LL`) on its own thread. The callback only copies the key event into a channel and calls `CallNextHookEx`; it never swallows a key, so a normal Ctrl+C keeps copying.
2. A **worker thread** runs one pure state machine per shortcut (`Detector`). It fires when the key is pressed twice inside the window (400 ms) with the modifiers held. Auto-repeat, another key in between, a late second press or the wrong modifiers start over; three quick presses fire once.
3. On the first press the worker notes the clipboard change counter. On the second press the app reads the clipboard text (only then, with `arboard`). If the counter did not move, nothing was copied: with "Ignore quick access when no text is selected" on, nothing happens; otherwise an empty popup opens. Images and files are ignored (TODO, Phase 4).
4. The foreground program's name is checked against the block list (Settings, Advanced), and Owl-L itself is ignored.
5. The popup window (`quick`, borderless, always on top) is created hidden at startup. It is placed by `placement.rs` (pointer position, work area of the screen under the pointer, DPI scale) and hides on Esc or focus loss unless pinned.

## Why a hook and the `windows` crate

Registering Ctrl+C with `RegisterHotKey` would take the key away from every other program. A low-level hook can observe keys instead. The official `windows` bindings are the smallest dependency that exposes it; the wrapper crates found either register hotkeys (taking the key) or do work inside the callback.

## Hook timeouts and safety

Windows waits for a low-level hook callback on every key press. If it takes longer than `LowLevelHooksTimeout` (a few hundred milliseconds at most) Windows skips it, and after repeated timeouts may drop the hook. The callback therefore does nothing but a channel send. If the process dies, Windows removes the hook by itself. On quit the hook is removed explicitly; with the shortcut disabled in Settings no hook is installed at all, and nothing runs until the shortcut is pressed.

## Limits

- Windows only. `dawn-hotkeys` has the same public functions as stubs on other systems.
- Programs that do not touch the clipboard on Ctrl+C (some games, remote desktop) give "nothing selected".
- Running as administrator in the foreground app can stop a normal-privilege hook from seeing keys.
- The first copy happens in the other program; if it answers slower than 150 ms after the second press the selection is treated as empty.

## Popup behavior

- **Resize and move.** Grabbing the popup's edge or header takes focus away for a moment. On focus loss the backend waits until the mouse button is up and the window stopped changing; if it was a resize or move it takes focus back instead of hiding (`blur_action`). Size and the offset from the pointer are remembered between openings (not between app starts).
- **Replace.** Puts the translation on the clipboard, brings the source window back (`SetForegroundWindow`), sends Ctrl+V, and 700 ms later restores the previous clipboard text unless something else was copied meanwhile (`restore_text`). Only text is restored. It is disabled when no text was selected or when the source window no longer exists.
- **Language detection** (`dawn-translate::detect`) looks at all known languages, not only installed ones. A detected language that is not installed or active shows "<Language> detected · not installed" with Download or Activate; a weak guess shows "Couldn't detect the language" with a source picker.
- **Smart target.** When source and target are the same language, English text goes to the last non-English target the user picked and anything else goes to English (`smart.rs`). The popup uses the adjusted target without changing the saved setting; the main window shows it in the target picker.

## Custom title bar and Snap Layouts

Windows are drawn without a native title bar. The page draws the buttons and drags with `data-tauri-drag-region`. For Snap Layouts, `titlebar.rs` subclasses the window and the WebView2 render window so that Windows' hit test sees the maximize button as `HTMAXBUTTON` (no keystrokes are simulated; `tauri-plugin-decorum` was rejected because it opens the flyout by pressing Win+Z). Needs a Windows 11 check by hand.
