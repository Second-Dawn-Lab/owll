//! Quick access: Ctrl+C+C (or another shortcut) reads the copied text and shows it translated,
//! in a small popup next to the pointer or in the main window.
//!
//! Nothing runs until the shortcut is pressed: the keyboard hook only forwards key events to a
//! detector thread (see `dawn-hotkeys`), and the clipboard is read only after a double press.

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use dawn_hotkeys::detector::Outcome;
use dawn_hotkeys::shortcut::{everyday_shortcut_warning, Shortcut};
use dawn_hotkeys::{self as hk, Hotkeys};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, State, Window, WindowEvent};

use crate::commands::{trace_enabled, trace_line, AppState, CmdError, CmdResult};
use crate::placement::{self, Rect, Screen};
use crate::settings::Settings;
use crate::tray;

pub const TRANSLATE: &str = "translate";
pub const CAPTURE: &str = "capture";
const POPUP: &str = "quick";
const DEFAULT_SIZE: (f64, f64) = (420.0, 260.0);
/// How long to wait for a program to put the copied text on the clipboard.
const COPY_WAIT: Duration = Duration::from_millis(150);

/// What the clipboard held after the shortcut.
#[derive(Debug)]
pub enum Selection {
    Text(String),
    /// Nothing was copied (no selection), or the text is empty.
    NoSelection,
    /// Something else was copied: an image or files. TODO (Phase 4): images go to the image tab.
    NotText,
    /// An image was copied: it is recognized as text.
    Image(dawn_ocr::OcrImage),
}

#[derive(Debug, PartialEq, Eq)]
pub enum Decision {
    Ignore,
    /// Open quick access; `None` opens it empty.
    Open(Option<String>),
}

/// What to do with the selection. Pure, so the setting is easy to test.
pub fn decide(selection: Selection, ignore_without_selection: bool) -> Decision {
    match selection {
        Selection::Text(text) if !text.trim().is_empty() => Decision::Open(Some(text)),
        _ if ignore_without_selection => Decision::Ignore,
        _ => Decision::Open(None),
    }
}

/// What the popup window needs to know when it opens.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickRequest {
    text: Option<String>,
    /// Program that was in front when the shortcut was pressed ("chrome.exe"), if known.
    app: Option<String>,
    /// "Replace" can paste the translation back into the program the text came from.
    can_replace: bool,
    /// "quick" (copied text) or "capture" (recognized from the screen or an image).
    kind: &'static str,
    /// Why there is no text: nothing found, or no OCR language for it.
    problem: Option<crate::ocr::Problem>,
}

impl QuickRequest {
    pub fn captured(text: Option<String>, problem: Option<crate::ocr::Problem>, kind: &'static str) -> Self {
        Self { text, app: None, can_replace: false, kind, problem }
    }
}

/// What to do when the popup loses focus.
#[derive(Debug, PartialEq, Eq)]
pub enum BlurAction {
    Hide,
    /// The user was resizing or moving the window: take focus back when they let go.
    Refocus,
    Keep,
}

/// Losing focus hides the popup, except when it is pinned, got focus back, or the focus was only
/// lost because the user grabbed its edge or header.
pub fn blur_action(pinned: bool, focused_again: bool, geometry_changed: bool) -> BlurAction {
    if pinned || focused_again {
        BlurAction::Keep
    } else if geometry_changed {
        BlurAction::Refocus
    } else {
        BlurAction::Hide
    }
}

/// The user is still in the middle of a click or a resize/move.
pub fn interaction_continues(button_down: bool, ms_since_geometry_change: Option<u64>) -> bool {
    button_down || ms_since_geometry_change.is_some_and(|ms| ms < 250)
}

/// After "Replace" the previous clipboard text goes back, unless something else was copied
/// in the meantime. `set_seq` is the clipboard counter right after we put the translation there.
pub fn restore_text(previous: Option<String>, set_seq: u32, now_seq: u32) -> Option<String> {
    previous.filter(|_| set_seq == now_seq)
}

pub struct Quick {
    hotkeys: Mutex<Option<Hotkeys>>,
    hook_error: Mutex<Option<String>>,
    /// Clipboard change counter at the first press of the shortcut.
    first_seq: AtomicU32,
    pinned: AtomicBool,
    /// The popup has had focus since it was shown (so losing it later means "click away").
    focused_once: AtomicBool,
    /// Size the popup opens with (logical pixels); remembers what the user resized it to.
    size: Mutex<(f64, f64)>,
    pending_popup: Mutex<Option<QuickRequest>>,
    pending_main: Mutex<Option<String>>,
    /// The window the selected text came from (for "Replace").
    source_hwnd: Mutex<Option<isize>>,
    /// Where the popup sits relative to the pointer after the user moved it (logical pixels).
    offset: Mutex<Option<placement::Offset>>,
    open_cursor: Mutex<(i32, i32)>,
    /// When we last moved or resized the popup ourselves (its events are then ignored).
    placed_at: Mutex<Option<Instant>>,
    /// Count and time of user-made moves and resizes.
    geometry_events: std::sync::atomic::AtomicU64,
    geometry_at: Mutex<Option<Instant>>,
}

impl Quick {
    pub fn new() -> Self {
        Self {
            hotkeys: Mutex::new(None),
            hook_error: Mutex::new(None),
            first_seq: AtomicU32::new(0),
            pinned: AtomicBool::new(false),
            focused_once: AtomicBool::new(false),
            size: Mutex::new(DEFAULT_SIZE),
            pending_popup: Mutex::new(None),
            pending_main: Mutex::new(None),
            source_hwnd: Mutex::new(None),
            offset: Mutex::new(None),
            open_cursor: Mutex::new((0, 0)),
            placed_at: Mutex::new(None),
            geometry_events: std::sync::atomic::AtomicU64::new(0),
            geometry_at: Mutex::new(None),
        }
    }
}

// --- shortcuts -------------------------------------------------------------

/// The shortcuts that should be listening right now.
fn active_shortcuts(s: &Settings) -> Vec<(String, Shortcut)> {
    let mut list = Vec::new();
    if s.translate_shortcut_enabled {
        if let Ok(shortcut) = s.translate_shortcut.parse() {
            list.push((TRANSLATE.to_string(), shortcut));
        }
    }
    // Area selection is explicit, so unlike quick access it ignores the block list.
    if s.capture_shortcut_enabled {
        if let Ok(shortcut) = s.capture_shortcut.parse() {
            list.push((CAPTURE.to_string(), shortcut));
        }
    }
    list
}

/// Install, update or remove the keyboard hook to match the settings.
/// With no shortcut enabled the hook is removed completely.
pub fn reconfigure(app: &AppHandle) {
    let quick = app.state::<Quick>();
    let list = active_shortcuts(&app.state::<AppState>().settings.lock().unwrap());
    let mut hotkeys = quick.hotkeys.lock().unwrap();
    if list.is_empty() {
        *hotkeys = None;
        *quick.hook_error.lock().unwrap() = None;
        return;
    }
    if let Some(h) = hotkeys.as_ref() {
        h.set_shortcuts(list);
        return;
    }
    let handle = app.clone();
    match Hotkeys::start(list, move |name, outcome| on_hotkey(&handle, name, outcome)) {
        Ok(h) => {
            *hotkeys = Some(h);
            *quick.hook_error.lock().unwrap() = None;
        }
        Err(err) => {
            eprintln!("could not start global shortcuts: {err}");
            *quick.hook_error.lock().unwrap() = Some(err.to_string());
        }
    }
}

/// Remove the keyboard hook (on quit).
pub fn shutdown(app: &AppHandle) {
    if let Some(quick) = app.try_state::<Quick>() {
        *quick.hotkeys.lock().unwrap() = None;
    }
}

/// Validate and tidy the shortcut and block list settings before they are saved.
pub fn normalize(s: &mut Settings) -> Result<(), CmdError> {
    let canonical = |text: &str| text.parse::<Shortcut>().map(|sc| sc.to_string()).map_err(|e| CmdError::new("bad_shortcut", e));
    s.translate_shortcut = canonical(&s.translate_shortcut)?;
    s.capture_shortcut = canonical(&s.capture_shortcut)?;
    s.block_list = tidy_block_list(&s.block_list);
    Ok(())
}

fn tidy_block_list(list: &[String]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for entry in list {
        let entry = entry.trim().to_lowercase();
        if !entry.is_empty() && !out.contains(&entry) {
            out.push(entry);
        }
    }
    out
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutCheck {
    valid: bool,
    error: Option<String>,
    /// The shortcut written the standard way.
    canonical: Option<String>,
    /// Names of other Owl-L shortcuts that react to the same keys.
    conflicts: Vec<String>,
    warning: Option<String>,
}

/// Check a shortcut the user is about to set. `others` are the other shortcuts as `(name, text)`.
fn check(name: &str, text: &str, others: &[(&str, &str)]) -> ShortcutCheck {
    let shortcut = match text.parse::<Shortcut>() {
        Ok(s) => s,
        Err(e) => return ShortcutCheck { valid: false, error: Some(e.to_string()), canonical: None, conflicts: vec![], warning: None },
    };
    let conflicts = others
        .iter()
        .filter(|(other, _)| *other != name)
        .filter(|(_, other_text)| other_text.parse::<Shortcut>().is_ok_and(|o| o.same_combo(&shortcut)))
        .map(|(other, _)| other.to_string())
        .collect();
    ShortcutCheck {
        valid: true,
        error: None,
        canonical: Some(shortcut.to_string()),
        conflicts,
        warning: everyday_shortcut_warning(&shortcut).map(str::to_string),
    }
}

#[tauri::command]
pub fn check_shortcut(state: State<'_, AppState>, name: String, text: String) -> ShortcutCheck {
    let s = state.settings.lock().unwrap();
    check(&name, &text, &[(TRANSLATE, &s.translate_shortcut), (CAPTURE, &s.capture_shortcut)])
}

/// Why the keyboard hook could not start, if it could not.
#[tauri::command]
pub fn hotkey_status(quick: State<'_, Quick>) -> Option<String> {
    quick.hook_error.lock().unwrap().clone()
}

// --- the shortcut was pressed ----------------------------------------------

/// Runs on the hotkey worker thread, never inside the keyboard hook.
fn on_hotkey(app: &AppHandle, name: &str, outcome: Outcome) {
    if name == CAPTURE {
        if outcome == Outcome::Fired {
            crate::capture::start(app);
        }
        return;
    }
    if name != TRANSLATE {
        return;
    }
    match outcome {
        // Remember the clipboard before the first copy lands, to tell later whether text was copied.
        Outcome::FirstPress => app.state::<Quick>().first_seq.store(hk::clipboard_sequence(), Ordering::Relaxed),
        Outcome::Fired => trigger(app),
        Outcome::Nothing => {}
    }
}

fn trigger(app: &AppHandle) {
    let started = Instant::now();
    let tracing = trace_enabled();
    if tracing {
        trace_line("quick: shortcut fired");
    }
    let settings = app.state::<AppState>().settings.lock().unwrap().clone();
    let source_hwnd = hk::foreground_window();

    let process = hk::foreground_process_name();
    if let Some(name) = &process {
        if hk::is_blocked(&settings.block_list, name) {
            if tracing {
                trace_line(&format!("quick: ignored, {name} is on the block list"));
            }
            return;
        }
        // Copying inside Owl-L itself is not a request for a translation.
        if own_process().is_some_and(|own| &own == name) {
            return;
        }
    }

    let selection = read_selection(app.state::<Quick>().first_seq.load(Ordering::Relaxed));
    if tracing {
        trace_line(&format!("quick: clipboard read after {} ms ({})", started.elapsed().as_millis(), describe(&selection)));
    }
    // An image was copied: recognize it instead.
    if let Selection::Image(image) = selection {
        crate::capture::recognize_and_show(app, image, None, hk::cursor_position(), "capture", started);
        return;
    }
    let text = match decide(selection, settings.ignore_quick_access_without_selection) {
        Decision::Ignore => return,
        Decision::Open(text) => text,
    };

    if settings.quick_access == "app" {
        open_main(app, text);
    } else {
        *app.state::<Quick>().source_hwnd.lock().unwrap() = source_hwnd;
        let can_replace = text.is_some() && source_hwnd.is_some();
        open_popup(app, QuickRequest { text, app: process, can_replace, kind: "quick", problem: None }, None);
    }
    if tracing {
        trace_line(&format!("quick: window shown {} ms after the second press was handled", started.elapsed().as_millis()));
    }
}

fn describe(s: &Selection) -> String {
    match s {
        Selection::Text(t) => format!("{} chars", t.chars().count()),
        Selection::NoSelection => "nothing selected".into(),
        Selection::NotText => "not text".into(),
        Selection::Image(i) => format!("image {}x{}", i.width, i.height),
    }
}

fn own_process() -> Option<String> {
    std::env::current_exe().ok()?.file_name().map(|n| n.to_string_lossy().to_lowercase())
}

/// Read the copied text. The first press copied it already when the clipboard counter has moved
/// since before that press; otherwise wait briefly for a slow program, then give up.
fn read_selection(seq_at_first_press: u32) -> Selection {
    let deadline = Instant::now() + COPY_WAIT;
    while hk::clipboard_sequence() == seq_at_first_press {
        if Instant::now() >= deadline {
            return Selection::NoSelection;
        }
        std::thread::sleep(Duration::from_millis(5));
    }
    // The program may still hold the clipboard open while it writes: try a few times.
    for attempt in 0..10 {
        match arboard::Clipboard::new().and_then(|mut c| c.get_text()) {
            Ok(text) => return Selection::Text(text),
            Err(arboard::Error::ContentNotAvailable) => {
                // Not text: an image (Chrome's "Copy image", a screenshot) is recognized instead.
                return match arboard::Clipboard::new().and_then(|mut c| c.get_image()) {
                    Ok(img) => Selection::Image(dawn_ocr::OcrImage { width: img.width as u32, height: img.height as u32, rgba: img.bytes.into_owned() }),
                    Err(_) => Selection::NotText,
                };
            }
            Err(_) if attempt < 9 => std::thread::sleep(Duration::from_millis(15)),
            Err(_) => break,
        }
    }
    Selection::NoSelection
}

// --- showing the result ----------------------------------------------------

fn screens(window: &tauri::WebviewWindow) -> Vec<Screen> {
    window
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|m| {
            let work = m.work_area();
            Screen {
                work: Rect { x: work.position.x, y: work.position.y, w: work.size.width as i32, h: work.size.height as i32 },
                scale: m.scale_factor(),
            }
        })
        .collect()
}

/// Show the popup next to `anchor` (a point in desktop pixels), or next to the pointer.
pub fn open_popup(app: &AppHandle, request: QuickRequest, anchor: Option<(i32, i32)>) {
    let Some(window) = app.get_webview_window(POPUP) else {
        eprintln!("quick popup window is missing");
        return;
    };
    let quick = app.state::<Quick>();
    if let (Some(cursor), logical) = (anchor.or_else(hk::cursor_position), *quick.size.lock().unwrap()) {
        *quick.open_cursor.lock().unwrap() = cursor;
        let offset = if anchor.is_some() { None } else { *quick.offset.lock().unwrap() };
        if let Some(rect) = placement::place_on_screens(cursor, logical, &screens(&window), offset) {
            *quick.placed_at.lock().unwrap() = Some(Instant::now());
            // Move first so the window is on the right screen (and scale) when it is resized.
            let _ = window.set_position(PhysicalPosition::new(rect.x, rect.y));
            let _ = window.set_size(PhysicalSize::new(rect.w as u32, rect.h as u32));
            let _ = window.set_position(PhysicalPosition::new(rect.x, rect.y));
        }
    }
    quick.pinned.store(false, Ordering::Relaxed);
    quick.focused_once.store(false, Ordering::Relaxed);
    *quick.pending_popup.lock().unwrap() = Some(request);
    let _ = app.emit_to(POPUP, "quick-open", ());
    let _ = window.show();
    let _ = window.set_focus();
}

fn open_main(app: &AppHandle, text: Option<String>) {
    *app.state::<Quick>().pending_main.lock().unwrap() = text;
    tray::show_main(app);
    let _ = app.emit_to("main", "quick-text", ());
}

/// Keep the popup's size for next time, and hide it when it loses focus (unless pinned).
pub fn on_window_event(window: &Window, event: &WindowEvent) {
    if window.label() != POPUP {
        return;
    }
    let app = window.app_handle();
    let quick = app.state::<Quick>();
    // Events caused by our own placement just after opening are not the user's doing.
    let ours = quick.placed_at.lock().unwrap().is_some_and(|t| t.elapsed() < Duration::from_millis(500));
    match event {
        WindowEvent::Focused(true) => quick.focused_once.store(true, Ordering::Relaxed),
        WindowEvent::Focused(false) => {
            if quick.focused_once.load(Ordering::Relaxed) && !quick.pinned.load(Ordering::Relaxed) {
                handle_blur(window.clone());
            }
        }
        WindowEvent::Resized(size) if !ours && window.is_visible().unwrap_or(false) => {
            note_geometry(&quick);
            if let Ok(scale) = window.scale_factor() {
                if size.width > 0 {
                    *quick.size.lock().unwrap() = (size.width as f64 / scale, size.height as f64 / scale);
                }
            }
        }
        WindowEvent::Moved(pos) if !ours && window.is_visible().unwrap_or(false) => {
            note_geometry(&quick);
            if let Ok(scale) = window.scale_factor() {
                let cursor = *quick.open_cursor.lock().unwrap();
                *quick.offset.lock().unwrap() = Some(placement::offset_of(cursor, (pos.x, pos.y), scale));
            }
        }
        WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            let _ = window.hide();
        }
        _ => {}
    }
}

fn note_geometry(quick: &Quick) {
    quick.geometry_events.fetch_add(1, Ordering::Relaxed);
    *quick.geometry_at.lock().unwrap() = Some(Instant::now());
}

/// The popup lost focus. Grabbing its edge or header for a resize or move does that too, so
/// wait until the mouse button is up and the window stopped changing before deciding.
fn handle_blur(window: Window) {
    std::thread::spawn(move || {
        let app = window.app_handle().clone();
        let quick = app.state::<Quick>();
        let events_before = quick.geometry_events.load(Ordering::Relaxed);
        let started = Instant::now();
        loop {
            let since = quick.geometry_at.lock().unwrap().map(|t| t.elapsed().as_millis() as u64);
            let recent = since.filter(|_| quick.geometry_events.load(Ordering::Relaxed) != events_before);
            if !interaction_continues(hk::left_button_down(), recent) || started.elapsed() > Duration::from_secs(60) {
                break;
            }
            std::thread::sleep(Duration::from_millis(40));
        }
        let changed = quick.geometry_events.load(Ordering::Relaxed) != events_before;
        let action = blur_action(quick.pinned.load(Ordering::Relaxed), window.is_focused().unwrap_or(false), changed);
        match action {
            BlurAction::Hide => {
                let _ = window.hide();
            }
            BlurAction::Refocus => {
                let _ = window.set_focus();
            }
            BlurAction::Keep => {}
        }
    });
}

// --- commands for the popup ------------------------------------------------

/// The popup asks what to show, once per opening.
#[tauri::command]
pub fn quick_take(quick: State<'_, Quick>) -> Option<QuickRequest> {
    quick.pending_popup.lock().unwrap().take()
}

#[tauri::command]
pub fn quick_hide(app: AppHandle) {
    if let Some(w) = app.get_webview_window(POPUP) {
        let _ = w.hide();
    }
}

#[tauri::command]
pub fn quick_set_pinned(quick: State<'_, Quick>, pinned: bool) {
    quick.pinned.store(pinned, Ordering::Relaxed);
}

/// "Open in Owl-L": hand the text to the main window and close the popup.
#[tauri::command]
pub fn quick_open_in_main(app: AppHandle, text: String) {
    quick_hide(app.clone());
    open_main(&app, Some(text));
}

/// The main window asks for text sent by quick access, once per request.
#[tauri::command]
pub fn take_quick_text(quick: State<'_, Quick>) -> Option<String> {
    quick.pending_main.lock().unwrap().take()
}

/// "Replace": put the translation on the clipboard, bring the source program back, paste, and
/// put the previous clipboard text back afterwards.
#[tauri::command]
pub async fn quick_replace(app: AppHandle, text: String) -> CmdResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let quick = app.state::<Quick>();
        let hwnd = (*quick.source_hwnd.lock().unwrap()).filter(|h| hk::window_exists(*h));
        let Some(hwnd) = hwnd else { return Err(CmdError::new("source_gone", "the program the text came from is closed")) };

        let mut clipboard = arboard::Clipboard::new().map_err(|e| CmdError::new("clipboard", e))?;
        let previous = clipboard.get_text().ok();
        clipboard.set_text(text).map_err(|e| CmdError::new("clipboard", e))?;
        let set_seq = hk::clipboard_sequence();

        if !hk::focus_window(hwnd) {
            if let Some(old) = previous {
                let _ = clipboard.set_text(old);
            }
            return Err(CmdError::new("source_gone", "could not bring the program back to the front"));
        }
        hk::send_paste();
        if !quick.pinned.load(Ordering::Relaxed) {
            quick_hide(app.clone());
        }
        // Programs read the clipboard a moment after Ctrl+V; give them time before restoring.
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(700));
            if let Some(old) = restore_text(previous, set_seq, hk::clipboard_sequence()) {
                if let Ok(mut c) = arboard::Clipboard::new() {
                    let _ = c.set_text(old);
                }
            }
        });
        Ok(())
    })
    .await
    .map_err(|e| CmdError::new("engine", e))?
}

/// "Don't open Owl-L for this app".
#[tauri::command]
pub fn quick_block_app(app: AppHandle, state: State<'_, AppState>, name: String) -> CmdResult<()> {
    let updated = {
        let mut settings = state.settings.lock().unwrap();
        let mut list = settings.block_list.clone();
        list.push(name);
        settings.block_list = tidy_block_list(&list);
        settings.save()?;
        settings.clone()
    };
    let _ = app.emit("settings-changed", &updated);
    quick_hide(app);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_image_is_never_ignored_as_missing_text() {
        let image = dawn_ocr::OcrImage { width: 1, height: 1, rgba: vec![0; 4] };
        assert_eq!(decide(Selection::NotText, true), Decision::Ignore);
        // Images are routed to recognition before `decide`; `decide` treats a stray one as no text.
        assert_eq!(decide(Selection::Image(image), true), Decision::Ignore);
    }

    fn text(s: &str) -> Selection {
        Selection::Text(s.to_string())
    }

    #[test]
    fn text_always_opens_quick_access() {
        assert_eq!(decide(text("Guten Tag"), true), Decision::Open(Some("Guten Tag".into())));
        assert_eq!(decide(text("Guten Tag"), false), Decision::Open(Some("Guten Tag".into())));
    }

    #[test]
    fn without_a_selection_the_setting_decides() {
        for selection in [Selection::NoSelection, Selection::NotText, text(""), text("  \r\n\t")] {
            assert_eq!(decide(selection, true), Decision::Ignore);
        }
        for selection in [Selection::NoSelection, Selection::NotText, text("   ")] {
            assert_eq!(decide(selection, false), Decision::Open(None), "an empty popup opens when the setting is off");
        }
    }

    #[test]
    fn losing_focus_hides_unless_pinned_refocused_or_resizing() {
        assert_eq!(blur_action(false, false, false), BlurAction::Hide);
        assert_eq!(blur_action(true, false, false), BlurAction::Keep, "pinned");
        assert_eq!(blur_action(false, true, false), BlurAction::Keep, "focus came back");
        assert_eq!(blur_action(false, false, true), BlurAction::Refocus, "the user was resizing or moving it");
        assert_eq!(blur_action(true, false, true), BlurAction::Keep);
    }

    #[test]
    fn an_interaction_lasts_while_the_button_is_down_or_the_window_keeps_changing() {
        assert!(interaction_continues(true, None));
        assert!(interaction_continues(false, Some(100)));
        assert!(!interaction_continues(false, Some(250)));
        assert!(!interaction_continues(false, None));
    }

    #[test]
    fn the_previous_clipboard_text_comes_back_unless_something_else_was_copied() {
        let prev = || Some("old".to_string());
        assert_eq!(restore_text(prev(), 7, 7), Some("old".into()));
        assert_eq!(restore_text(prev(), 7, 8), None, "the user copied something else meanwhile");
        assert_eq!(restore_text(None, 7, 7), None, "there was nothing to restore");
    }

    #[test]
    fn block_list_entries_are_tidied() {
        let list = vec![" KeePass.exe ".to_string(), "code.exe".to_string(), "keepass.exe".to_string(), "".to_string(), "  ".to_string()];
        assert_eq!(tidy_block_list(&list), vec!["keepass.exe", "code.exe"]);
    }

    #[test]
    fn shortcuts_are_validated_and_written_the_standard_way() {
        let mut s = Settings { translate_shortcut: "shift+ctrl+c c".into(), ..Settings::default() };
        normalize(&mut s).unwrap();
        assert_eq!(s.translate_shortcut, "Ctrl+Shift+C C");

        let mut bad = Settings { translate_shortcut: "C".into(), ..Settings::default() };
        assert_eq!(normalize(&mut bad).unwrap_err().code, "bad_shortcut");
        let mut bad = Settings { capture_shortcut: "Ctrl+Banana".into(), ..Settings::default() };
        assert_eq!(normalize(&mut bad).unwrap_err().code, "bad_shortcut");
    }

    #[test]
    fn shortcut_checks_report_conflicts_and_warnings() {
        let others = [(TRANSLATE, "Ctrl+C C"), (CAPTURE, "Ctrl+F8")];
        let ok = check(TRANSLATE, "Ctrl+Alt+T T", &others);
        assert!(ok.valid && ok.conflicts.is_empty() && ok.warning.is_none());
        assert_eq!(ok.canonical.as_deref(), Some("Ctrl+Alt+T T"));

        let clash = check(TRANSLATE, "Ctrl+F8", &others);
        assert_eq!(clash.conflicts, vec![CAPTURE]);
        // A shortcut never conflicts with itself.
        assert!(check(TRANSLATE, "Ctrl+C C", &others).conflicts.is_empty());

        assert!(check(TRANSLATE, "Ctrl+V", &others).warning.is_some());
        let bad = check(TRANSLATE, "nope", &others);
        assert!(!bad.valid && bad.error.is_some());
    }

    #[test]
    fn shortcut_settings_survive_a_round_trip() {
        let mut s = Settings::default();
        s.merge(serde_json::json!({ "translateShortcut": "Alt+Q Q", "translateShortcutEnabled": false, "blockList": ["a.exe"] })).unwrap();
        let json = serde_json::to_string(&s).unwrap();
        let back: Settings = serde_json::from_str(&json).unwrap();
        assert_eq!(back.translate_shortcut, "Alt+Q Q");
        assert!(!back.translate_shortcut_enabled);
        assert_eq!(back.block_list, vec!["a.exe"]);
        assert!(active_shortcuts(&back).iter().all(|(n, _)| n != TRANSLATE), "a disabled shortcut is not registered");
        let defaults = active_shortcuts(&Settings::default());
        assert_eq!(defaults.iter().map(|(n, _)| n.as_str()).collect::<Vec<_>>(), vec![TRANSLATE, CAPTURE]);
        let no_capture = Settings { capture_shortcut_enabled: false, ..Settings::default() };
        assert_eq!(active_shortcuts(&no_capture).len(), 1, "a disabled capture shortcut is not registered");
        assert_eq!(Settings::default().capture_shortcut, "Ctrl+Shift+O");
        assert!(Settings::default().capture_shortcut_enabled, "capture is on by default");
        // The default is Ctrl+C pressed twice.
        assert_eq!(Settings::default().translate_shortcut.parse::<Shortcut>().unwrap(), Shortcut::ctrl_c_c());
    }
}
