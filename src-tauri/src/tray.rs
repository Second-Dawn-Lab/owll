//! Tray icon and the windows it opens.

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Wry};

use crate::commands::AppState;

pub struct TrayLabels {
    open: MenuItem<Wry>,
    settings: MenuItem<Wry>,
    quit: MenuItem<Wry>,
}

fn labels(lang: &str) -> (&'static str, &'static str, &'static str) {
    match lang {
        "de" => ("Owl-L öffnen", "Einstellungen", "Beenden"),
        _ => ("Open Owl-L", "Settings", "Quit"),
    }
}

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let (o, s, q) = labels("en");
    let open = MenuItem::with_id(app, "open", o, true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", s, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", q, true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &settings, &quit])?;

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("Owl-L")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main(app),
            "settings" => open_settings_window(app, None),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;

    app.manage(TrayLabels { open, settings, quit });
    Ok(())
}

pub fn set_language(app: &AppHandle, lang: &str) {
    if let Some(l) = app.try_state::<TrayLabels>() {
        let (o, s, q) = labels(lang);
        let _ = l.open.set_text(o);
        let _ = l.settings.set_text(s);
        let _ = l.quit.set_text(q);
    }
}

pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/// Open (or focus) the settings window, optionally on a given page.
///
/// The window is built on a separate thread: building a window from the main thread
/// (a sync command or a tray handler) can deadlock on Windows and leave it blank.
pub fn open_settings_window(app: &AppHandle, page: Option<String>) {
    let app = app.clone();
    std::thread::spawn(move || {
        if let Some(page) = &page {
            *app.state::<AppState>().settings_page.lock().unwrap() = Some(page.clone());
        }
        if let Some(w) = app.get_webview_window("settings") {
            let _ = w.show();
            let _ = w.unminimize();
            let _ = w.set_focus();
            if let Some(page) = page {
                let _ = w.emit("settings-navigate", page);
            }
            return;
        }
        let built = tauri::WebviewWindowBuilder::new(&app, "settings", tauri::WebviewUrl::default())
            .title("Owl-L")
            .inner_size(860.0, 620.0)
            .min_inner_size(680.0, 480.0)
            .decorations(false)
            .shadow(true)
            .build();
        if let Err(err) = built {
            eprintln!("could not open settings window: {err}");
        }
    });
}
