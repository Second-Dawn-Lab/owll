//! Live captions: watch a region of the screen and keep showing the translation of the text in it.
//!
//! The logic that decides *when* to read and *what is new* is `dawn-live` (pure, unit-tested); the region is grabbed with
//! `dawn-capture` (a GDI copy of just that rectangle, about 1 ms of CPU); text is read with the same Windows OCR as the area
//! capture; lines are translated with the same engine, detection, glossary and smart-target rules as everywhere else.
//! The caption bar is a window of its own that is excluded from screen capture, so it can sit over or next to the region
//! without ever being read. The bar keeps the conversation of a session in memory (up to 2,000 lines); only when the session ends and
//! the user chooses "Save" is it written to the history.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use dawn_capture::{Grabber, Region};
use dawn_live::{interval_ms, BlackEvent, Pipeline, Speed};
use dawn_translate::{Detection, TranslateError, TranslateOptions};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, State, WebviewUrl, WebviewWindowBuilder};

use crate::commands::{trace_enabled, trace_line, AppState, CmdError, CmdResult};
use crate::ocr;

pub const LABEL: &str = "live";

/// What the bar and the loop share while a session runs.
pub struct Control {
    pub paused: AtomicBool,
    pub locked: AtomicBool,
    /// "auto" or a language code chosen in the bar.
    pub source: Mutex<String>,
    pub target: Mutex<String>,
    /// The loop forgets what it has read (the region or a language changed).
    pub reset: AtomicBool,
    pub stop: AtomicBool,
}

struct Session {
    id: u64,
    control: Arc<Control>,
    region: Region,
    /// Unix time in milliseconds.
    started_at: u64,
}

fn now_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

#[derive(Default)]
pub struct Live {
    session: Mutex<Option<Session>>,
    next_id: AtomicU64,
    /// When the program last set the bar's size itself: resizes just after that are not the user's.
    placed_at: Mutex<Option<Instant>>,
    /// Counts the user's resizes, so only the last one of a burst is written to the settings.
    resize_gen: AtomicU64,
}

impl Live {
    pub fn new() -> Self {
        Self { session: Mutex::new(None), next_id: AtomicU64::new(1), placed_at: Mutex::new(None), resize_gen: AtomicU64::new(0) }
    }

    pub fn running(&self) -> bool {
        self.session.lock().unwrap().is_some()
    }
}

fn trace(msg: &str) {
    if trace_enabled() {
        trace_line(msg);
    }
}

// --- events to the bar ---------------------------------------------------------

#[derive(Serialize, Clone)]
struct CaptionLine {
    original: String,
    translation: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LinesEvent {
    replace_last: bool,
    lines: Vec<CaptionLine>,
    from: String,
    to: String,
    /// Time spent recognizing and translating, for the trace and the latency report.
    ocr_ms: u64,
    translate_ms: u64,
}

#[derive(Serialize, Clone)]
struct StatusEvent {
    /// "running" | "paused" | "black" | "no_text" | "ocr_missing" | "pack_missing" | "undetected" | "error"
    state: &'static str,
    /// Language codes that explain the state (the OCR or translation languages that are missing).
    languages: Vec<String>,
    message: String,
}

fn status(app: &AppHandle, state: &'static str, languages: Vec<String>, message: impl Into<String>) {
    let _ = app.emit_to(LABEL, "live-status", StatusEvent { state, languages, message: message.into() });
}

// --- starting ------------------------------------------------------------------

/// The shortcut, the menu and the buttons: stop a running session, or start one (the region is drawn first).
pub fn toggle(app: &AppHandle) {
    trace("live: toggle");
    let live = app.state::<Live>();
    if live.running() {
        // A locked bar cannot be clicked: the shortcut unlocks it first, and stops on the next press.
        let locked = live.session.lock().unwrap().as_ref().is_some_and(|s| s.control.locked.load(Ordering::Relaxed));
        if locked {
            unlock(app);
        } else {
            stop(app);
        }
    } else {
        start_selection(app);
    }
}

/// The tray menu entry: from the main thread of the menu handler, so the work runs on its own thread.
pub fn start_or_stop_from_menu(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || toggle(&app));
}

/// Draw the region: the same overlay as area capture, then `begin`.
pub fn start_selection(app: &AppHandle) {
    crate::capture::start_for_live(app);
}

fn controls_from_settings(state: &AppState) -> Arc<Control> {
    let s = state.settings.lock().unwrap();
    Arc::new(Control {
        paused: AtomicBool::new(false),
        locked: AtomicBool::new(false),
        source: Mutex::new(s.source_language.clone()),
        target: Mutex::new(s.target_language.clone()),
        reset: AtomicBool::new(false),
        stop: AtomicBool::new(false),
    })
}

/// The region was drawn: show the bar and start watching. When a session is already running (the user chose "Change
/// region"), the bar stays and the loop watches the new region.
pub fn begin(app: &AppHandle, region: Region) {
    let app = app.clone();
    std::thread::spawn(move || {
        let state = app.state::<AppState>();
        let live = app.state::<Live>();
        let existing = live.session.lock().unwrap().as_ref().map(|s| s.control.clone());
        if let Some(old) = existing {
            // Change region: end the old loop, keep the bar and its languages.
            old.stop.store(true, Ordering::SeqCst);
            std::thread::sleep(Duration::from_millis(150));
            let control = old;
            control.stop.store(false, Ordering::SeqCst);
            control.reset.store(true, Ordering::SeqCst);
            let id = live.next_id.fetch_add(1, Ordering::SeqCst);
            *live.session.lock().unwrap() = Some(Session { id, control: control.clone(), region, started_at: now_ms() });
            place_bar_for(&app, region);
            spawn_loop(&app, id, control, region);
            return;
        }
        let control = controls_from_settings(&state);
        let id = live.next_id.fetch_add(1, Ordering::SeqCst);
        let started_at = now_ms();
        *live.session.lock().unwrap() = Some(Session { id, control: control.clone(), region, started_at });
        // The bar of a session that ended is still open (it asked about saving): it starts afresh for the new one.
        if let Some(bar) = app.get_webview_window(LABEL) {
            let _ = bar.emit("live-reset", started_at);
            place_bar_for(&app, region);
            let _ = bar.show();
        } else if let Err(err) = open_bar(&app, region) {
            eprintln!("could not open the caption bar: {err}");
            *live.session.lock().unwrap() = None;
            return;
        }
        spawn_loop(&app, id, control, region);
    });
}

/// Stop watching. The bar stays open with the whole conversation and asks whether to save it (or does what the user chose
/// to be remembered); it closes with `live_close`.
pub fn stop(app: &AppHandle) {
    let live = app.state::<Live>();
    let session = live.session.lock().unwrap().take();
    let Some(session) = session else { return };
    session.control.stop.store(true, Ordering::SeqCst);
    match app.get_webview_window(LABEL) {
        Some(bar) => {
            // A locked bar could not be clicked to answer.
            let _ = bar.set_ignore_cursor_events(false);
            let _ = bar.emit("live-ended", session.started_at);
        }
        None => {}
    }
}

/// Close the bar window.
pub fn close_bar(app: &AppHandle) {
    if let Some(bar) = app.get_webview_window(LABEL) {
        let _ = bar.hide();
        let _ = bar.close();
    }
}

/// Make the bar clickable again (the tray menu and the shortcut call this).
pub fn unlock(app: &AppHandle) {
    let live = app.state::<Live>();
    if let Some(s) = live.session.lock().unwrap().as_ref() {
        s.control.locked.store(false, Ordering::Relaxed);
    }
    if let Some(bar) = app.get_webview_window(LABEL) {
        let _ = bar.set_ignore_cursor_events(false);
        let _ = bar.emit("live-locked", false);
    }
}

// --- the bar window ------------------------------------------------------------

/// The bar's size in logical pixels: the size the user gave it last time (kept in the settings) when there is one, else as wide as
/// the region (480 to 1100) and as tall as `lines` lines of this font need.
pub fn bar_size(saved: (u32, u32), region_width: u32, lines: u32, font_px: u32, show_original: bool) -> (u32, u32) {
    let width = if saved.0 >= 320 { saved.0 } else { region_width.clamp(480, 1100) };
    let height = if saved.1 >= 70 { saved.1 } else { bar_height(lines, font_px, show_original) };
    (width, height)
}

/// The bar's height in logical pixels for this many lines of this font size.
pub fn bar_height(lines: u32, font_px: u32, show_original: bool) -> u32 {
    let line = (font_px as f64 * 1.45).ceil() as u32;
    let original = if show_original { (font_px as f64 * 0.62 * 1.4).ceil() as u32 * lines.max(1) } else { 0 };
    36 + lines.max(1) * line + original + 18
}

/// The monitors as rectangles of the virtual desktop with their scale.
fn monitors(app: &AppHandle) -> Vec<(dawn_live::Rect, f64)> {
    app.available_monitors().unwrap_or_default().iter().map(|m| (dawn_live::Rect::new(m.position().x, m.position().y, m.size().width, m.size().height), m.scale_factor())).collect()
}

fn place_bar_for(app: &AppHandle, region: Region) {
    let Some(bar) = app.get_webview_window(LABEL) else { return };
    let (width, height) = {
        let s = app.state::<AppState>().settings.lock().unwrap().clone();
        bar_size((s.live_bar_width, s.live_bar_height), 0, s.live_lines, s.live_font_size, s.live_show_original)
    };
    // Without a saved width the bar is as wide as the region.
    let width = if app.state::<AppState>().settings.lock().unwrap().live_bar_width >= 320 { width } else { (region.w as f64).clamp(480.0, 1100.0) as u32 };
    let all = monitors(app);
    let rects: Vec<dawn_live::Rect> = all.iter().map(|(r, _)| *r).collect();
    let area = dawn_live::Rect::new(region.x, region.y, region.w, region.h);
    let scale = all.iter().find(|(r, _)| r.x <= area.x + area.w as i32 / 2 && area.x + (area.w as i32) / 2 < r.right() && r.y <= area.y + area.h as i32 / 2 && area.y + (area.h as i32) / 2 < r.bottom()).map_or(1.0, |(_, s)| *s);
    let (w, h) = (dawn_live::physical(width, scale), dawn_live::physical(height, scale));
    let spot = dawn_live::place_bar(area, w, h, &rects, dawn_live::physical(10, scale) as i32);
    *app.state::<Live>().placed_at.lock().unwrap() = Some(Instant::now());
    let _ = bar.set_size(PhysicalSize::new(spot.w, spot.h));
    let _ = bar.set_position(PhysicalPosition::new(spot.x, spot.y));
}

/// Windows can leave a window out of every screen capture; the bar uses that, so it never reads its own text.
#[cfg(windows)]
pub fn exclude_from_capture(window: &tauri::WebviewWindow) -> bool {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{SetWindowDisplayAffinity, WINDOW_DISPLAY_AFFINITY};
    let Ok(hwnd) = window.hwnd() else { return false };
    // WDA_EXCLUDEFROMCAPTURE (0x11): Windows 10 version 2004 and later.
    unsafe { SetWindowDisplayAffinity(HWND(hwnd.0), WINDOW_DISPLAY_AFFINITY(0x11)).is_ok() }
}

#[cfg(not(windows))]
pub fn exclude_from_capture(_: &tauri::WebviewWindow) -> bool {
    false
}

fn open_bar(app: &AppHandle, region: Region) -> tauri::Result<()> {
    let window = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::default())
        .title("Owl-L live captions")
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(true)
        .shadow(false)
        .visible(false)
        .focused(false)
        .inner_size(640.0, 140.0)
        .min_inner_size(320.0, 70.0)
        .build()?;
    let hidden_from_capture = exclude_from_capture(&window);
    trace(&format!("live: caption bar excluded from capture: {hidden_from_capture}"));
    place_bar_for(app, region);
    let _ = window.show();
    Ok(())
}

// --- the loop ------------------------------------------------------------------

#[cfg(windows)]
fn on_battery() -> bool {
    use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
    let mut status = SYSTEM_POWER_STATUS::default();
    // ACLineStatus 0 = offline (battery), 1 = online, 255 = unknown.
    unsafe { GetSystemPowerStatus(&mut status).is_ok() && status.ACLineStatus == 0 }
}

#[cfg(not(windows))]
fn on_battery() -> bool {
    false
}

fn sleep_checking(control: &Control, ms: u64) {
    let until = Instant::now() + Duration::from_millis(ms);
    while Instant::now() < until && !control.stop.load(Ordering::Relaxed) {
        std::thread::sleep(Duration::from_millis(25).min(until.saturating_duration_since(Instant::now())));
    }
}

fn spawn_loop(app: &AppHandle, id: u64, control: Arc<Control>, region: Region) {
    let app = app.clone();
    std::thread::spawn(move || {
        run(&app, id, &control, region);
        // Only the loop of the current session ends the session (a replaced loop just returns).
        let live = app.state::<Live>();
        let current = live.session.lock().unwrap().as_ref().is_some_and(|s| s.id == id);
        if current && control.stop.load(Ordering::Relaxed) {
            *live.session.lock().unwrap() = None;
        }
    });
}

fn run(app: &AppHandle, id: u64, control: &Arc<Control>, region: Region) {
    let state = app.state::<AppState>();
    let grabber = match Grabber::new(region) {
        Ok(g) => g,
        Err(err) => {
            status(app, "error", vec![], err.to_string());
            return;
        }
    };
    let started = Instant::now();
    let mut pipeline = Pipeline::new();
    let mut last_detected: Option<String> = None;
    let mut last_problem = Instant::now() - Duration::from_secs(60);
    let cancel = AtomicBool::new(false);
    status(app, "running", vec![], "");

    while !control.stop.load(Ordering::Relaxed) {
        // A newer session replaced this one.
        if app.state::<Live>().session.lock().unwrap().as_ref().is_none_or(|s| s.id != id) {
            return;
        }
        if control.paused.load(Ordering::Relaxed) {
            sleep_checking(control, 150);
            pipeline.forget_frame();
            continue;
        }
        if control.reset.swap(false, Ordering::Relaxed) {
            pipeline.reset();
        }
        let tick = Instant::now();
        let now_ms = started.elapsed().as_millis() as u64;
        let settings = state.settings.lock().unwrap().clone();

        let frame = match grabber.grab() {
            Ok(f) => f,
            Err(err) => {
                status(app, "error", vec![], err.to_string());
                sleep_checking(control, 1500);
                continue;
            }
        };
        let source = control.source.lock().unwrap().clone();
        let languages = if source != "auto" { vec![source] } else { settings.capture_languages.clone() };
        let active = state.engine.installed_languages();
        let mut ocr_ms = 0;
        let (rgba, width, height) = (frame.rgba.clone(), frame.width, frame.height);
        let mut frame = Some(frame);
        let step = pipeline.step(now_ms, &rgba, width, height, &mut || {
            let read = Instant::now();
            let image = ocr::image_of(frame.take()?);
            let out = match ocr::recognize_screen_lines(&languages, &active, image) {
                Ok(text) => Some(text),
                Err(problem) => {
                    if problem.code == "language_missing" && last_problem.elapsed() > Duration::from_secs(5) {
                        status(app, "ocr_missing", problem.languages.clone(), "");
                        last_problem = Instant::now();
                    }
                    None
                }
            };
            ocr_ms = read.elapsed().as_millis() as u64;
            out
        });
        match step.black {
            Some(BlackEvent::Started) => status(app, "black", vec![], ""),
            Some(BlackEvent::Ended) => status(app, "running", vec![], ""),
            None => {}
        }
        if step.cleared {
            let _ = app.emit_to(LABEL, "live-cleared", ());
        }
        let delta = step.delta;
        if !delta.is_empty() {
            let translate_started = Instant::now();
            match translate_lines(app, control, &settings, &delta.lines, &mut last_detected, &cancel) {
                Ok((from, to, lines)) => {
                    let translate_ms = translate_started.elapsed().as_millis() as u64;
                    trace(&format!("live: {} new line(s): read {ocr_ms} ms, translated {translate_ms} ms", lines.len()));
                    let _ = app.emit_to(LABEL, "live-lines", LinesEvent { replace_last: delta.replace_last, lines, from, to, ocr_ms, translate_ms });
                }
                Err(Problem::Pack(language)) => status(app, "pack_missing", vec![language], ""),
                Err(Problem::Undetected) => status(app, "undetected", vec![], ""),
                Err(Problem::Other(message)) => status(app, "error", vec![], message),
            }
        }

        // The pause is the interval minus the time the pass already took; reading is what costs, so its time stretches the interval.
        let work_ms = tick.elapsed().as_millis() as u64;
        let wait = interval_ms(Speed::parse(&settings.live_speed), step.idle_ms, on_battery(), ocr_ms).saturating_sub(work_ms);
        sleep_checking(control, wait);
    }
}

enum Problem {
    /// The language pack to download.
    Pack(String),
    Undetected,
    Other(String),
}

/// Translate the new lines, one by one (a line is one caption): the language is the one chosen in the bar, else the setting,
/// else detected from the text; the target is never the source's own language.
fn translate_lines(app: &AppHandle, control: &Control, settings: &crate::settings::Settings, lines: &[String], last_detected: &mut Option<String>, cancel: &AtomicBool) -> Result<(String, String, Vec<CaptionLine>), Problem> {
    let state = app.state::<AppState>();
    let chosen = control.source.lock().unwrap().clone();
    let from = if chosen != "auto" {
        chosen
    } else {
        let active = state.engine.installed_languages();
        match dawn_translate::detect_in_context(&lines.join(" "), &active, last_detected.as_deref()) {
            Detection::Language(code) => {
                *last_detected = Some(code.clone());
                code
            }
            _ => last_detected.clone().ok_or(Problem::Undetected)?,
        }
    };
    let wanted = control.target.lock().unwrap().clone();
    let to = crate::smart::smart_target(&from, &wanted, &settings.last_foreign_target);
    let options = TranslateOptions { batch_size: 16, fast_beam: None, beam: if settings.live_speed == "fast" { 1 } else { 2 } };
    let mut out = Vec::new();
    for line in dawn_live::group_sentences(lines) {
        let line = &line;
        match state.engine.translate_streaming(line, &from, &to, cancel, &options, &mut |_| {}) {
            Ok(t) => out.push(CaptionLine { original: line.clone(), translation: t.text }),
            Err(TranslateError::ModelMissing(language)) => return Err(Problem::Pack(language)),
            Err(TranslateError::ModelLoad { model, .. }) => return Err(Problem::Pack(state.catalog.language_for_model(&model).map(|l| l.code.clone()).unwrap_or_default())),
            Err(other) => return Err(Problem::Other(other.to_string())),
        }
    }
    Ok((from, to, out))
}

// --- commands for the bar --------------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveState {
    running: bool,
    /// Unix ms when the running session started (0 when none).
    started_at: u64,
    paused: bool,
    locked: bool,
    source: String,
    target: String,
}

#[tauri::command]
pub fn live_state(live: State<'_, Live>) -> LiveState {
    match live.session.lock().unwrap().as_ref() {
        Some(s) => LiveState { running: true, started_at: s.started_at, paused: s.control.paused.load(Ordering::Relaxed), locked: s.control.locked.load(Ordering::Relaxed), source: s.control.source.lock().unwrap().clone(), target: s.control.target.lock().unwrap().clone() },
        None => LiveState { running: false, started_at: 0, paused: false, locked: false, source: "auto".into(), target: String::new() },
    }
}

/// The Images tab button, the menu and the shortcut all start here.
#[tauri::command]
pub fn live_toggle(app: AppHandle) {
    std::thread::spawn(move || toggle(&app));
}

#[tauri::command]
pub fn live_stop(app: AppHandle) {
    stop(&app);
}

#[tauri::command]
pub fn live_pause(app: AppHandle, live: State<'_, Live>, paused: bool) {
    if let Some(s) = live.session.lock().unwrap().as_ref() {
        s.control.paused.store(paused, Ordering::Relaxed);
    }
    status(&app, if paused { "paused" } else { "running" }, vec![], "");
}

/// Click-through: the bar no longer takes mouse clicks, so it does not get in the way of the video controls.
#[tauri::command]
pub fn live_lock(app: AppHandle, live: State<'_, Live>, locked: bool) {
    if let Some(s) = live.session.lock().unwrap().as_ref() {
        s.control.locked.store(locked, Ordering::Relaxed);
    }
    if let Some(bar) = app.get_webview_window(LABEL) {
        let _ = bar.set_ignore_cursor_events(locked);
    }
}

/// The languages chosen in the bar ("auto" reads the source from the text).
#[tauri::command]
pub fn live_languages(live: State<'_, Live>, source: String, target: String) {
    if let Some(s) = live.session.lock().unwrap().as_ref() {
        *s.control.source.lock().unwrap() = source;
        *s.control.target.lock().unwrap() = target;
        s.control.reset.store(true, Ordering::Relaxed);
    }
}

/// Draw the region again (the video window moved).
#[tauri::command]
pub fn live_change_region(app: AppHandle) {
    std::thread::spawn(move || crate::capture::start_for_live(&app));
}

/// The bar changed size or the settings changed: put it where it belongs again.
#[tauri::command]
pub fn live_replace_bar(app: AppHandle, live: State<'_, Live>) {
    let region = live.session.lock().unwrap().as_ref().map(|s| s.region);
    if let Some(region) = region {
        place_bar_for(&app, region);
    }
}

/// The conversation is over and the bar may go.
#[tauri::command]
pub fn live_close(app: AppHandle) {
    close_bar(&app);
}

#[derive(serde::Deserialize)]
pub struct SavedLine {
    t: u64,
    original: String,
    translation: String,
}

/// "Save": the conversation of the session becomes one entry of the history (when the history is on).
#[tauri::command]
pub fn live_save_session(app: AppHandle, state: State<'_, AppState>, from: String, to: String, started_at: u64, lines: Vec<SavedLine>) -> CmdResult<bool> {
    if lines.is_empty() || !state.settings.lock().unwrap().keep_history {
        return Ok(false);
    }
    let lines: Vec<crate::history::SessionLine> = lines.into_iter().map(|l| crate::history::SessionLine { t: l.t, original: l.original, translation: l.translation }).collect();
    state.history.lock().unwrap().add_session(from, to, started_at, now_ms(), &lines)?;
    let _ = app.emit("history-changed", ());
    Ok(true)
}

/// "Remember my choice": "always" or "never" (anything else is "ask").
#[tauri::command]
pub fn live_set_save_choice(app: AppHandle, state: State<'_, AppState>, choice: String) -> CmdResult<()> {
    let choice = if choice == "always" || choice == "never" { choice } else { "ask".to_string() };
    let updated = {
        let mut settings = state.settings.lock().unwrap();
        settings.live_save_choice = choice;
        settings.save()?;
        settings.clone()
    };
    let _ = app.emit("settings-changed", &updated);
    Ok(())
}

/// The user resized the bar: remember the size (logical pixels) for the next session.
pub fn on_window_event(window: &tauri::Window, event: &tauri::WindowEvent) {
    if window.label() != LABEL {
        return;
    }
    let tauri::WindowEvent::Resized(size) = event else { return };
    let app = window.app_handle().clone();
    let live = app.state::<Live>();
    if live.placed_at.lock().unwrap().is_some_and(|t| t.elapsed() < Duration::from_millis(600)) || size.width == 0 {
        return;
    }
    let scale = window.scale_factor().unwrap_or(1.0);
    let (w, h) = ((size.width as f64 / scale).round() as u32, (size.height as f64 / scale).round() as u32);
    let generation = live.resize_gen.fetch_add(1, Ordering::SeqCst) + 1;
    std::thread::spawn(move || {
        // Only the last resize of a drag is written.
        std::thread::sleep(Duration::from_millis(500));
        if app.state::<Live>().resize_gen.load(Ordering::SeqCst) != generation {
            return;
        }
        let state = app.state::<AppState>();
        let mut settings = state.settings.lock().unwrap();
        settings.live_bar_width = w;
        settings.live_bar_height = h;
        let _ = settings.save();
    });
}

/// Write the transcript the user exported (the path comes from the save dialog).
#[tauri::command]
pub fn live_save_text(path: String, text: String) -> CmdResult<()> {
    std::fs::write(&path, text).map_err(|e| CmdError::new("io", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_bar_grows_with_lines_font_and_the_original_line() {
        assert!(bar_height(2, 28, false) > bar_height(1, 28, false));
        assert!(bar_height(2, 36, false) > bar_height(2, 28, false));
        assert!(bar_height(2, 28, true) > bar_height(2, 28, false));
        assert_eq!(bar_height(0, 20, false), bar_height(1, 20, false), "at least one line");
    }

    #[test]
    fn the_bar_has_the_size_the_user_gave_it_else_one_from_the_region_and_the_lines_setting() {
        // Nothing saved: as wide as the region (480 to 1100), as tall as the lines need.
        assert_eq!(bar_size((0, 0), 300, 2, 28, false), (480, bar_height(2, 28, false)));
        assert_eq!(bar_size((0, 0), 2000, 2, 28, false).0, 1100);
        // A saved size wins, each side on its own; absurdly small saved values are ignored.
        assert_eq!(bar_size((700, 420), 300, 2, 28, false), (700, 420));
        assert_eq!(bar_size((700, 0), 300, 2, 28, false), (700, bar_height(2, 28, false)));
        assert_eq!(bar_size((10, 10), 800, 1, 20, false), (800, bar_height(1, 20, false)));
    }
}

/// An image sequence that looks like subtitles (white text on black, appearing word by word, then scrolling), read by the real
/// Windows OCR and translated by the real German model (Windows only; needs PowerShell, an English OCR language and the German pack):
///
/// ```text
/// cargo test -p owll live_sequence -- --ignored --nocapture
/// ```
#[cfg(all(test, windows))]
mod live_sequence {
    use std::path::PathBuf;
    use std::sync::Arc;

    use dawn_live::{group_sentences, similarity, Pipeline};
    use dawn_translate::{Ct2Engine, Ct2Options};

    use super::*;

    const SCENES: [&str; 8] = [
        "",
        "The meeting",
        "The meeting starts",
        "The meeting starts at",
        "The meeting starts at nine.",
        "We will begin with|the quarterly report.",
        "the quarterly report.|Please open page four.",
        "Please open page four.|Questions are welcome.",
    ];
    /// Which picture is on screen at each look (500 ms apart).
    const SEQUENCE: [usize; 21] = [0, 1, 2, 3, 4, 4, 4, 0, 0, 5, 5, 5, 6, 6, 6, 7, 7, 7, 0, 0, 0];
    const EXPECTED: [&str; 4] = ["The meeting starts at nine.", "We will begin with the quarterly report.", "Please open page four.", "Questions are welcome."];

    fn render(dir: &std::path::Path) -> Vec<PathBuf> {
        let scenes = SCENES.iter().map(|s| format!("'{s}'")).collect::<Vec<_>>().join(",");
        let script = format!(
            r#"
Add-Type -AssemblyName System.Drawing
$scenes = @({scenes})
$i = 0
foreach ($text in $scenes) {{
  $bmp = New-Object System.Drawing.Bitmap 900, 130
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::Black)
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $font = New-Object System.Drawing.Font('Segoe UI', 34, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $y = 8
  foreach ($line in $text.Split('|')) {{ if ($line) {{ $g.DrawString($line, $font, [System.Drawing.Brushes]::White, 14, $y) }}; $y += 52 }}
  $bmp.Save((Join-Path '{dir}' ("scene$i.png")), [System.Drawing.Imaging.ImageFormat]::Png)
  $i++
}}
"#,
            dir = dir.to_string_lossy()
        );
        let status = std::process::Command::new("powershell").args(["-NoProfile", "-Command", &script]).status().expect("powershell");
        assert!(status.success());
        (0..SCENES.len()).map(|i| dir.join(format!("scene{i}.png"))).collect()
    }

    #[test]
    #[ignore = "needs Windows OCR for English, PowerShell and the German pack"]
    fn subtitles_that_build_up_and_scroll_are_translated_line_by_line_once() {
        let dir = std::env::temp_dir().join(format!("owll-live-sequence-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let frames: Vec<image::RgbaImage> = render(&dir).iter().map(|p| image::open(p).unwrap().to_rgba8()).collect();

        let store = dawn_models::ModelStore::open_default();
        let catalog = Arc::new(dawn_models::Catalog::bundled());
        assert!(store.is_language_installed(&catalog, "de"), "install German first");
        let engine = Ct2Engine::new(store, catalog, &Ct2Options::default());
        let options = TranslateOptions { batch_size: 16, fast_beam: None, beam: 2 };
        let cancel = AtomicBool::new(false);
        // Warm the model up so the first caption is not charged the load time.
        let _ = engine.translate_streaming("Hello.", "en", "de", &cancel, &options, &mut |_| {});

        let mut pipeline = Pipeline::new();
        let (mut originals, mut translations): (Vec<String>, Vec<String>) = (Vec::new(), Vec::new());
        let (mut translate_calls, mut reads) = (0, 0);
        let (mut ocr_total, mut translate_total) = (Duration::ZERO, Duration::ZERO);
        let (mut latency_ms, mut last_change_at) = (Vec::new(), 0u64);
        let wall = Instant::now();
        for (i, scene) in SEQUENCE.iter().enumerate() {
            let now_ms = i as u64 * 500;
            if i == 0 || SEQUENCE[i - 1] != *scene {
                last_change_at = now_ms;
            }
            let img = &frames[*scene];
            let step = pipeline.step(now_ms, img.as_raw(), img.width(), img.height(), &mut || {
                let started = Instant::now();
                reads += 1;
                let out = ocr::recognize_screen_lines(&["en".to_string()], &["en".to_string(), "de".to_string()], dawn_ocr::OcrImage { width: img.width(), height: img.height(), rgba: img.as_raw().clone() }).ok();
                ocr_total += started.elapsed();
                out
            });
            for group in group_sentences(&step.delta.lines) {
                let started = Instant::now();
                translate_calls += 1;
                let t = engine.translate_streaming(&group, "en", "de", &cancel, &options, &mut |_| {}).unwrap();
                translate_total += started.elapsed();
                // From the picture that completed the caption to its translation: the looks until it was stable, plus the work.
                latency_ms.push(now_ms - last_change_at + started.elapsed().as_millis() as u64);
                println!("look {i:>2} (t={now_ms:>5} ms): {group:?} -> {:?}", t.text);
                originals.push(group);
                translations.push(t.text);
            }
        }
        println!(
            "{} looks, {reads} read (the rest were unchanged), OCR {:.0} ms per read, translation {:.0} ms per line, {} lines, latency (picture to translation, with looks every 500 ms) {latency_ms:?} ms; whole run {:.1} s",
            SEQUENCE.len(),
            ocr_total.as_secs_f64() * 1000.0 / reads.max(1) as f64,
            translate_total.as_secs_f64() * 1000.0 / translate_calls.max(1) as f64,
            translate_calls,
            wall.elapsed().as_secs_f64()
        );
        assert_eq!(translate_calls, EXPECTED.len(), "each line is translated once: {originals:?}");
        for (got, want) in originals.iter().zip(EXPECTED) {
            assert!(similarity(got, want) >= 0.85, "{got:?} is not {want:?}");
        }
        assert!(translations.iter().zip(&originals).all(|(t, o)| !t.trim().is_empty() && t != o), "{translations:?}");
        assert!(reads < SEQUENCE.len(), "pictures that did not change were not read again");
    }
}
