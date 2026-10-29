//! Area selection: freeze the screen, let the user drag a rectangle, recognize the text in it and
//! show the translation in the quick popup.
//!
//! The screenshots stay in memory (never written to disk, never in the history). One overlay
//! window per monitor displays that monitor's frozen screenshot; the page inside reports the
//! dragged rectangle in CSS pixels and `dawn_capture::map` turns it into screenshot pixels.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Instant;

use dawn_capture::{map, Screen};
use dawn_hotkeys as hk;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Runtime, State, UriSchemeContext, WebviewUrl, WebviewWindowBuilder};

use crate::commands::{trace_enabled, trace_line, AppState, CmdError, CmdResult};
use crate::ocr;
use crate::quick::{self, QuickRequest};

const OVERLAY_PREFIX: &str = "overlay-";

struct Session {
    id: u64,
    screens: Vec<Screen>,
    /// The overlay that gets keyboard focus (the monitor under the pointer).
    focus: usize,
    started: Instant,
}

pub struct Capture {
    session: Mutex<Option<Session>>,
    /// A capture is in progress (overlay shown, or recognition running).
    busy: AtomicBool,
    next_id: AtomicU64,
    /// The main window was hidden to start this capture; show it again if the capture is cancelled.
    restore_main: AtomicBool,
}

impl Capture {
    pub fn new() -> Self {
        Self { session: Mutex::new(None), busy: AtomicBool::new(false), next_id: AtomicU64::new(1), restore_main: AtomicBool::new(false) }
    }
}

fn trace(msg: &str) {
    if trace_enabled() {
        trace_line(msg);
    }
}

fn overlays(app: &AppHandle) -> Vec<tauri::WebviewWindow> {
    app.webview_windows().into_iter().filter(|(label, _)| label.starts_with(OVERLAY_PREFIX)).map(|(_, w)| w).collect()
}

fn hide_overlays(app: &AppHandle) {
    for w in overlays(app) {
        let _ = w.hide();
    }
}

/// Start an area selection: capture all monitors, then show the overlays.
pub fn start(app: &AppHandle) {
    let capture = app.state::<Capture>();
    if capture.busy.swap(true, Ordering::SeqCst) {
        return;
    }
    trace("capture: shortcut fired");
    let started = Instant::now();
    let screens = match dawn_capture::capture_all() {
        Ok(s) => s,
        Err(err) => {
            eprintln!("capture failed: {err}");
            capture.busy.store(false, Ordering::SeqCst);
            return;
        }
    };
    trace(&format!("capture: screenshots taken after {} ms ({} monitors)", started.elapsed().as_millis(), screens.len()));

    let cursor = hk::cursor_position().unwrap_or((0, 0));
    let focus = screens
        .iter()
        .position(|s| cursor.0 >= s.x && cursor.0 < s.x + s.width as i32 && cursor.1 >= s.y && cursor.1 < s.y + s.height as i32)
        .or_else(|| screens.iter().position(|s| s.primary))
        .unwrap_or(0);

    let id = capture.next_id.fetch_add(1, Ordering::SeqCst);
    let geometry: Vec<(i32, i32, u32, u32)> = screens.iter().map(|s| (s.x, s.y, s.width, s.height)).collect();
    *capture.session.lock().unwrap() = Some(Session { id, screens, focus, started });

    for (i, (x, y, w, h)) in geometry.into_iter().enumerate() {
        let label = format!("{OVERLAY_PREFIX}{i}");
        let window = match app.get_webview_window(&label) {
            Some(w) => w,
            None => match WebviewWindowBuilder::new(app, &label, WebviewUrl::default())
                .title("Owl-L capture")
                .decorations(false)
                .always_on_top(true)
                .skip_taskbar(true)
                .resizable(false)
                .shadow(false)
                .visible(false)
                .focused(false)
                .build()
            {
                Ok(w) => w,
                Err(err) => {
                    eprintln!("could not create the capture overlay: {err}");
                    cancel(app);
                    return;
                }
            },
        };
        // Cover the monitor exactly. Move first so the window is on the monitor (and its DPI)
        // when it is resized.
        let _ = window.set_position(PhysicalPosition::new(x, y));
        let _ = window.set_size(PhysicalSize::new(w, h));
        let _ = window.set_position(PhysicalPosition::new(x, y));
        let _ = app.emit_to(&label, "capture-open", ());
    }
}

/// Throw the screenshots away and close the overlays.
pub fn cancel(app: &AppHandle) {
    hide_overlays(app);
    let capture = app.state::<Capture>();
    *capture.session.lock().unwrap() = None;
    capture.busy.store(false, Ordering::SeqCst);
    if capture.restore_main.swap(false, Ordering::SeqCst) {
        crate::tray::show_main(app);
    }
}

// --- the screenshot for the overlay page --------------------------------------

/// Handler of the `owlcap://` scheme: `/<session>/<monitor>` is that monitor's frozen screenshot.
pub fn serve<R: Runtime>(ctx: UriSchemeContext<'_, R>, request: tauri::http::Request<Vec<u8>>) -> tauri::http::Response<Vec<u8>> {
    let mut parts = request.uri().path().trim_matches('/').split('/');
    let (session, index) = (parts.next().and_then(|s| s.parse::<u64>().ok()), parts.next().and_then(|s| s.parse::<usize>().ok()));
    let body = ctx.app_handle().try_state::<Capture>().and_then(|capture| {
        let guard = capture.session.lock().unwrap();
        let session_data = guard.as_ref().filter(|s| Some(s.id) == session)?;
        Some(map::to_bmp(&session_data.screens.get(index?)?.frame))
    });
    match body {
        Some(bytes) => tauri::http::Response::builder()
            .header("Content-Type", "image/bmp")
            .header("Access-Control-Allow-Origin", "*")
            .header("Cache-Control", "no-store")
            .body(bytes)
            .unwrap_or_default(),
        None => tauri::http::Response::builder().status(404).body(Vec::new()).unwrap_or_default(),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayInfo {
    image_url: String,
}

/// An overlay page asks what to display; `None` when no capture is running.
#[tauri::command]
pub fn capture_overlay_info(capture: State<'_, Capture>, label: String) -> Option<OverlayInfo> {
    let index: usize = label.strip_prefix(OVERLAY_PREFIX)?.parse().ok()?;
    let guard = capture.session.lock().unwrap();
    let session = guard.as_ref().filter(|s| index < s.screens.len())?;
    let base = if cfg!(windows) { "http://owlcap.localhost" } else { "owlcap://localhost" };
    Some(OverlayInfo { image_url: format!("{base}/{}/{index}", session.id) })
}

/// The overlay has decoded its screenshot: show it (the one under the pointer takes focus).
#[tauri::command]
pub fn capture_overlay_ready(app: AppHandle, capture: State<'_, Capture>, label: String) {
    let Some(index) = label.strip_prefix(OVERLAY_PREFIX).and_then(|i| i.parse::<usize>().ok()) else { return };
    let (focus, started) = match capture.session.lock().unwrap().as_ref() {
        Some(s) => (s.focus, s.started),
        None => return,
    };
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.show();
        if index == focus {
            let _ = window.set_focus();
        }
        trace(&format!("capture: overlay {index} visible {} ms after the shortcut", started.elapsed().as_millis()));
    }
}

#[tauri::command]
pub fn capture_cancel(app: AppHandle) {
    cancel(&app);
}

/// The user finished dragging. `rect` is `[x, y, width, height]` and `viewport` `[width, height]`,
/// both in CSS pixels of the overlay of monitor `index`.
#[tauri::command]
pub fn capture_finish(app: AppHandle, capture: State<'_, Capture>, label: String, rect: [f64; 4], viewport: [f64; 2]) -> CmdResult<()> {
    let index: usize = label.strip_prefix(OVERLAY_PREFIX).and_then(|i| i.parse().ok()).ok_or_else(|| CmdError::new("bad_request", "unknown overlay"))?;
    hide_overlays(&app);
    capture.restore_main.store(false, Ordering::SeqCst);
    if map::is_tiny(rect[2], rect[3]) {
        cancel(&app);
        return Ok(());
    }
    let session = capture.session.lock().unwrap().take();
    let Some(session) = session else {
        capture.busy.store(false, Ordering::SeqCst);
        return Ok(());
    };
    trace(&format!("capture: selection released {} ms after the shortcut", session.started.elapsed().as_millis()));
    let Some(screen) = session.screens.get(index) else {
        capture.busy.store(false, Ordering::SeqCst);
        return Ok(());
    };
    let pixels = map::to_image_rect((rect[0], rect[1], rect[2], rect[3]), (viewport[0], viewport[1]), (screen.frame.width, screen.frame.height));
    let Some(pixels) = pixels else {
        capture.busy.store(false, Ordering::SeqCst);
        return Ok(());
    };
    let desktop = map::to_desktop((screen.x, screen.y), pixels);
    let cropped = map::crop(&screen.frame, pixels);
    let started = session.started;
    drop(session); // the full screenshots are no longer needed
    let Some(frame) = cropped else {
        capture.busy.store(false, Ordering::SeqCst);
        return Ok(());
    };

    // Below the selection's left edge; the popup flips above when there is no room.
    let anchor = (desktop.x, desktop.y + desktop.h as i32);
    std::thread::spawn(move || {
        let busy = app.state::<Capture>();
        recognize_and_show(&app, ocr::image_of(frame), Some(anchor), "capture", started);
        busy.busy.store(false, Ordering::SeqCst);
    });
    Ok(())
}

/// Recognize text in an image and show the result in the popup. Also used for an image on the
/// clipboard (`kind` "quick").
pub fn recognize_and_show(app: &AppHandle, image: dawn_ocr::OcrImage, anchor: Option<(i32, i32)>, kind: &'static str, since: Instant) {
    let state = app.state::<AppState>();
    let (languages, active) = (state.settings.lock().unwrap().capture_languages.clone(), state.engine.installed_languages());
    let recognized = Instant::now();
    let outcome = ocr::recognize(&languages, &active, image);
    trace(&format!("capture: text recognized in {} ms ({} ms after the shortcut)", recognized.elapsed().as_millis(), since.elapsed().as_millis()));
    let request = match outcome {
        Ok(text) if !text.trim().is_empty() => QuickRequest::captured(Some(text), None, kind),
        Ok(_) => QuickRequest::captured(None, Some(ocr::Problem { code: "no_text", languages: Vec::new() }), kind),
        Err(problem) => QuickRequest::captured(None, Some(problem), kind),
    };
    quick::open_popup(app, request, anchor);
}

// --- commands around recognition ----------------------------------------------

#[tauri::command]
pub fn ocr_status(state: State<'_, AppState>) -> ocr::OcrStatus {
    ocr::status(&state.settings.lock().unwrap().capture_languages, &state.engine.installed_languages())
}

/// Open Windows' language settings, where OCR languages are installed.
#[tauri::command]
pub fn open_windows_language_settings() {
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("cmd").args(["/C", "start", "", "ms-settings:regionlanguage"]).spawn();
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrOut {
    text: String,
    problem: Option<ocr::Problem>,
}

/// Recognize the text in an image file's bytes (Images tab: dropped, opened or pasted images).
#[tauri::command]
pub async fn ocr_image(app: AppHandle, request: tauri::ipc::Request<'_>) -> CmdResult<OcrOut> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else { return Err(CmdError::new("bad_request", "expected image bytes")) };
    let bytes = bytes.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let decoded = image::load_from_memory(&bytes).map_err(|e| CmdError::new("bad_image", e))?.to_rgba8();
        let state = app.state::<AppState>();
        let (languages, active) = (state.settings.lock().unwrap().capture_languages.clone(), state.engine.installed_languages());
        let image = dawn_ocr::OcrImage { width: decoded.width(), height: decoded.height(), rgba: decoded.into_raw() };
        Ok(match ocr::recognize(&languages, &active, image) {
            Ok(text) => OcrOut { text, problem: None },
            Err(problem) => OcrOut { text: String::new(), problem: Some(problem) },
        })
    })
    .await
    .map_err(|e| CmdError::new("engine", e))?
}

/// Start an area selection from the interface. With `hide_main` the main window steps aside
/// first, so it is not in the screenshot (the capture buttons); "Try again" in the popup keeps it.
#[tauri::command]
pub fn capture_start(app: AppHandle, hide_main: bool) {
    std::thread::spawn(move || {
        if hide_main {
            if let Some(main) = app.get_webview_window("main") {
                if main.is_visible().unwrap_or(false) {
                    let _ = main.hide();
                    app.state::<Capture>().restore_main.store(true, Ordering::SeqCst);
                    std::thread::sleep(std::time::Duration::from_millis(250));
                }
            }
        }
        start(&app);
    });
}
