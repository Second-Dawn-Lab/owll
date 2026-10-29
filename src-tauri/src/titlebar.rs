//! Windows 11 Snap Layouts for our own maximize button.
//!
//! The title bar is drawn by the web page, so Windows does not know where the maximize button
//! is. Snap Layouts appear when the pointer rests on a window area whose hit test is
//! `HTMAXBUTTON`. The web page sends the button's rectangle here, and two window procedures
//! (subclasses) answer the hit test:
//!
//! * the WebView2 render window answers `HTTRANSPARENT` over the button, so the hit test falls
//!   through to the top-level window;
//! * the top-level window answers `HTMAXBUTTON`, turns the click into maximize/restore and tells
//!   the page about hover (the page cannot see the pointer over a non-client area).
//!
//! Everywhere else the pointer keeps working as before. No keystrokes are simulated.

use serde::Serialize;
use tauri::{AppHandle, WebviewWindow};

#[derive(Serialize, Clone)]
struct Hover(bool);

/// The maximize button's rectangle in physical pixels, relative to the window's client area:
/// `[left, top, right, bottom]`. An empty rectangle switches the feature off for the window.
#[tauri::command]
pub fn set_maximize_rect(app: AppHandle, window: WebviewWindow, rect: [i32; 4]) {
    #[cfg(windows)]
    imp::set_rect(app, window, rect);
    #[cfg(not(windows))]
    let _ = (app, window, rect);
}

#[cfg(windows)]
mod imp {
    use std::sync::{Mutex, OnceLock};

    use tauri::{AppHandle, Emitter, WebviewWindow};
    use windows::core::BOOL;
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, POINT, WPARAM};
    use windows::Win32::Graphics::Gdi::ClientToScreen;
    use windows::Win32::UI::Input::KeyboardAndMouse::{TrackMouseEvent, TME_LEAVE, TME_NONCLIENT, TRACKMOUSEEVENT};
    use windows::Win32::UI::Shell::{DefSubclassProc, SetWindowSubclass};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumChildWindows, GetAncestor, GetClassNameW, IsZoomed, ShowWindow, GA_ROOT, HTMAXBUTTON, SW_MAXIMIZE, SW_RESTORE,
        WM_NCDESTROY, WM_NCHITTEST, WM_NCLBUTTONDOWN, WM_NCLBUTTONUP, WM_NCMOUSELEAVE, WM_NCMOUSEMOVE,
    };

    use super::Hover;

    struct Entry {
        hwnd: isize,
        label: String,
        rect: [i32; 4],
    }

    static ENTRIES: Mutex<Vec<Entry>> = Mutex::new(Vec::new());
    static APP: OnceLock<AppHandle> = OnceLock::new();

    const PARENT_ID: usize = 0x4F57_4C01;
    const CHILD_ID: usize = 0x4F57_4C02;
    const HTTRANSPARENT: isize = -1;

    pub fn set_rect(app: AppHandle, window: WebviewWindow, rect: [i32; 4]) {
        let _ = APP.set(app);
        let Ok(hwnd) = window.hwnd() else { return };
        let hwnd = hwnd.0 as isize;
        {
            let mut entries = ENTRIES.lock().unwrap();
            entries.retain(|e| e.hwnd != hwnd);
            if rect[2] > rect[0] && rect[3] > rect[1] {
                entries.push(Entry { hwnd, label: window.label().to_string(), rect });
            }
        }
        // Subclassing has to happen on the thread that owns the window.
        let _ = window.clone().run_on_main_thread(move || unsafe {
            let parent = HWND(hwnd as *mut _);
            let _ = SetWindowSubclass(parent, Some(parent_proc), PARENT_ID, 0);
            let _ = EnumChildWindows(Some(parent), Some(find_render_window), LPARAM(0));
        });
    }

    unsafe extern "system" fn find_render_window(child: HWND, _: LPARAM) -> BOOL {
        let mut name = [0u16; 64];
        let len = unsafe { GetClassNameW(child, &mut name) } as usize;
        let class = String::from_utf16_lossy(&name[..len.min(name.len())]);
        if class == "Chrome_RenderWidgetHostHWND" {
            let _ = unsafe { SetWindowSubclass(child, Some(child_proc), CHILD_ID, 0) };
        }
        BOOL(1)
    }

    /// Screen coordinates packed in a mouse message's `lparam`.
    fn point_of(lparam: LPARAM) -> POINT {
        POINT { x: (lparam.0 & 0xFFFF) as i16 as i32, y: ((lparam.0 >> 16) & 0xFFFF) as i16 as i32 }
    }

    fn over_button(root: HWND, screen: POINT) -> bool {
        let Some(rect) = ENTRIES.lock().unwrap().iter().find(|e| e.hwnd == root.0 as isize).map(|e| e.rect) else {
            return false;
        };
        let mut origin = POINT { x: 0, y: 0 };
        if !unsafe { ClientToScreen(root, &mut origin) }.as_bool() {
            return false;
        }
        let (x, y) = (screen.x - origin.x, screen.y - origin.y);
        x >= rect[0] && x < rect[2] && y >= rect[1] && y < rect[3]
    }

    fn emit_hover(root: HWND, hovering: bool) {
        let label = ENTRIES.lock().unwrap().iter().find(|e| e.hwnd == root.0 as isize).map(|e| e.label.clone());
        if let (Some(label), Some(app)) = (label, APP.get()) {
            let _ = app.emit_to(label, "maximize-hover", Hover(hovering));
        }
    }

    unsafe extern "system" fn child_proc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM, _id: usize, _data: usize) -> LRESULT {
        if msg == WM_NCHITTEST {
            let root = unsafe { GetAncestor(hwnd, GA_ROOT) };
            if over_button(root, point_of(lparam)) {
                return LRESULT(HTTRANSPARENT);
            }
        }
        unsafe { DefSubclassProc(hwnd, msg, wparam, lparam) }
    }

    unsafe extern "system" fn parent_proc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM, _id: usize, _data: usize) -> LRESULT {
        let on_button = wparam.0 as u32 == HTMAXBUTTON;
        match msg {
            WM_NCHITTEST => {
                let result = unsafe { DefSubclassProc(hwnd, msg, wparam, lparam) };
                // Only claim the button where the window would otherwise treat it as client area.
                if over_button(hwnd, point_of(lparam)) && result.0 as u32 == 1 {
                    return LRESULT(HTMAXBUTTON as isize);
                }
                result
            }
            // A press on the button is ours; Windows has no caption button to draw here.
            WM_NCLBUTTONDOWN if on_button => LRESULT(0),
            WM_NCLBUTTONUP if on_button => {
                let command = if unsafe { IsZoomed(hwnd) }.as_bool() { SW_RESTORE } else { SW_MAXIMIZE };
                let _ = unsafe { ShowWindow(hwnd, command) };
                LRESULT(0)
            }
            WM_NCMOUSEMOVE if on_button => {
                emit_hover(hwnd, true);
                let mut track = TRACKMOUSEEVENT {
                    cbSize: std::mem::size_of::<TRACKMOUSEEVENT>() as u32,
                    dwFlags: TME_LEAVE | TME_NONCLIENT,
                    hwndTrack: hwnd,
                    dwHoverTime: 0,
                };
                let _ = unsafe { TrackMouseEvent(&mut track) };
                unsafe { DefSubclassProc(hwnd, msg, wparam, lparam) }
            }
            WM_NCMOUSELEAVE => {
                emit_hover(hwnd, false);
                unsafe { DefSubclassProc(hwnd, msg, wparam, lparam) }
            }
            WM_NCDESTROY => {
                ENTRIES.lock().unwrap().retain(|e| e.hwnd != hwnd.0 as isize);
                unsafe { DefSubclassProc(hwnd, msg, wparam, lparam) }
            }
            _ => unsafe { DefSubclassProc(hwnd, msg, wparam, lparam) },
        }
    }
}
