//! Lists that open in a window of their own.
//!
//! A drop-down inside a small window (the caption bar, the quick popup) is cut off at the window's edge. Instead the page
//! asks for a list window: a small always-on-top window next to the control, kept on screen, that closes on Esc, on a click
//! elsewhere or when something is chosen, and tells the window that asked what was chosen. One mechanism for every window.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use dawn_live::{place_popup, Rect};
use serde::Deserialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, State, WebviewUrl, WebviewWindowBuilder, Window, WindowEvent};

use crate::commands::{CmdError, CmdResult};

pub const LABEL: &str = "picker";

#[derive(Default)]
pub struct Picker {
    spec: Mutex<Option<Value>>,
    /// The window that asked, to send the answer to.
    opener: Mutex<Option<String>>,
    open: AtomicBool,
}

impl Picker {
    /// A list window is open: the window that asked must not hide itself because it lost the focus to it.
    pub fn is_open(&self) -> bool {
        self.open.load(Ordering::Relaxed)
    }
}

#[derive(Deserialize)]
struct Anchor {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

/// Row height, search field and padding of the list page, in logical pixels (see `app.css`).
const ROW: f64 = 34.0;
const CHROME: f64 = 52.0;
const SEARCH: f64 = 46.0;
const MAX_HEIGHT: f64 = 380.0;

/// The list window's size in logical pixels for `rows` rows (groups count as rows) and whether it has a search field.
pub fn picker_size(rows: usize, search: bool, anchor_width: f64) -> (f64, f64) {
    let height = (rows as f64 * ROW + CHROME + if search { SEARCH } else { 0.0 }).min(MAX_HEIGHT);
    (anchor_width.clamp(220.0, 340.0), height)
}

/// Open the list described by `spec` (`id`, `anchor` in CSS pixels of the asking window, `items`, `search`, ...). The
/// answer comes back as the event `picker-choice` (`{id, value}`) or `picker-closed` (`{id}`) in the asking window.
#[tauri::command]
pub async fn picker_open(app: AppHandle, window: tauri::WebviewWindow, spec: Value) -> CmdResult<()> {
    let anchor: Anchor = serde_json::from_value(spec.get("anchor").cloned().unwrap_or(Value::Null)).map_err(|e| CmdError::new("bad_request", e))?;
    let rows = spec.get("items").and_then(Value::as_array).map_or(0, Vec::len);
    let search = spec.get("search").and_then(Value::as_bool).unwrap_or(false);

    // The control in screen pixels: the asking window's content origin plus the CSS rectangle times its scale.
    let origin = window.inner_position().map_err(|e| CmdError::new("window", e))?;
    let scale = window.scale_factor().unwrap_or(1.0);
    let control = Rect::new(origin.x + (anchor.x * scale).round() as i32, origin.y + (anchor.y * scale).round() as i32, (anchor.width * scale).round() as u32, (anchor.height * scale).round() as u32);
    let monitors: Vec<(Rect, f64)> = app.available_monitors().unwrap_or_default().iter().map(|m| (Rect::new(m.position().x, m.position().y, m.size().width, m.size().height), m.scale_factor())).collect();
    let rects: Vec<Rect> = monitors.iter().map(|(r, _)| *r).collect();
    let target_scale = monitors.iter().find(|(r, _)| control.x >= r.x && control.x < r.right() && control.y >= r.y && control.y < r.bottom()).map_or(scale, |(_, s)| *s);
    let (w, h) = picker_size(rows, search, anchor.width);
    let spot = place_popup(control, dawn_live::physical(w as u32, target_scale), dawn_live::physical(h as u32, target_scale), &rects, dawn_live::physical(4, target_scale) as i32);

    let picker = app.state::<Picker>();
    *picker.spec.lock().unwrap() = Some(spec);
    *picker.opener.lock().unwrap() = Some(window.label().to_string());
    picker.open.store(true, Ordering::Relaxed);

    let list = match app.get_webview_window(LABEL) {
        Some(w) => w,
        None => WebviewWindowBuilder::new(&app, LABEL, WebviewUrl::default())
            .title("Owl-L list")
            .decorations(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .shadow(true)
            .visible(false)
            .focused(false)
            .inner_size(w, h)
            .build()
            .map_err(|e| CmdError::new("window", e))?,
    };
    crate::live::exclude_from_capture(&list);
    let _ = list.set_size(PhysicalSize::new(spot.w, spot.h));
    let _ = list.set_position(PhysicalPosition::new(spot.x, spot.y));
    let _ = list.emit("picker-spec", ());
    let _ = list.show();
    let _ = list.set_focus();
    Ok(())
}

/// The list page asks what to show.
#[tauri::command]
pub fn picker_spec(picker: State<'_, Picker>) -> Option<Value> {
    picker.spec.lock().unwrap().clone()
}

fn finish(app: &AppHandle, choice: Option<String>) {
    let picker = app.state::<Picker>();
    picker.open.store(false, Ordering::Relaxed);
    let id = picker.spec.lock().unwrap().as_ref().and_then(|s| s.get("id").cloned()).unwrap_or(Value::Null);
    let opener = picker.opener.lock().unwrap().clone();
    if let Some(list) = app.get_webview_window(LABEL) {
        let _ = list.hide();
    }
    if let Some(opener) = opener {
        match choice {
            Some(value) => {
                let _ = app.emit_to(opener.as_str(), "picker-choice", json!({ "id": id, "value": value }));
            }
            None => {
                let _ = app.emit_to(opener.as_str(), "picker-closed", json!({ "id": id }));
            }
        }
        // The window that asked gets the focus back (the quick popup would otherwise hide itself).
        if let Some(w) = app.get_webview_window(&opener) {
            let _ = w.set_focus();
        }
    }
}

#[tauri::command]
pub fn picker_choose(app: AppHandle, value: String) {
    finish(&app, Some(value));
}

#[tauri::command]
pub fn picker_close(app: AppHandle) {
    finish(&app, None);
}

/// A click elsewhere takes the focus away from the list window: it closes.
pub fn on_window_event(window: &Window, event: &WindowEvent) {
    if window.label() != LABEL {
        return;
    }
    if let WindowEvent::Focused(false) = event {
        let app = window.app_handle();
        if app.state::<Picker>().is_open() {
            finish(app, None);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_list_grows_with_its_rows_up_to_a_limit_and_adds_room_for_the_search_field() {
        let (_, few) = picker_size(3, false, 100.0);
        let (_, many) = picker_size(8, false, 100.0);
        let (_, huge) = picker_size(200, false, 100.0);
        assert!(few < many && many < huge);
        assert_eq!(huge, MAX_HEIGHT);
        assert!(picker_size(3, true, 100.0).1 > few);
    }

    #[test]
    fn the_list_is_as_wide_as_the_control_within_sensible_bounds() {
        assert_eq!(picker_size(5, false, 100.0).0, 220.0);
        assert_eq!(picker_size(5, false, 260.0).0, 260.0);
        assert_eq!(picker_size(5, false, 900.0).0, 340.0);
    }
}
