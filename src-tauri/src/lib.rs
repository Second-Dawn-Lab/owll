//! Owl-L backend: window/tray lifecycle, settings, history and the translation commands.

mod capture;
mod commands;
mod history;
mod ocr;
mod placement;
mod quick;
mod settings;
mod smart;
mod titlebar;
mod tray;

use tauri::{Emitter, Manager, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;

use commands::AppState;

pub fn run() {
    tauri::Builder::default()
        // Must be registered first: a second launch just brings the running window forward.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| tray::show_main(app)))
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--hidden"])))
        .manage(AppState::load())
        .manage(quick::Quick::new())
        .manage(capture::Capture::new())
        .register_uri_scheme_protocol("owlcap", capture::serve)
        .invoke_handler(tauri::generate_handler![
            commands::translate,
            commands::detect_language,
            commands::list_languages,
            commands::install_language,
            commands::cancel_install,
            commands::activate_language,
            commands::activate_languages,
            commands::deactivate_language,
            commands::delete_model_files,
            commands::take_activation_offer,
            commands::repair_language,
            commands::get_settings,
            commands::set_settings,
            commands::history_list,
            commands::history_add,
            commands::history_delete,
            commands::history_clear,
            commands::open_settings,
            commands::take_settings_page,
            commands::quit_app,
            commands::trace,
            commands::set_tray_language,
            commands::close_action,
            quick::check_shortcut,
            quick::hotkey_status,
            quick::quick_take,
            quick::quick_hide,
            quick::quick_set_pinned,
            quick::quick_open_in_main,
            quick::take_quick_text,
            quick::quick_block_app,
            quick::quick_replace,
            capture::capture_overlay_info,
            capture::capture_overlay_ready,
            capture::capture_cancel,
            capture::capture_finish,
            capture::capture_start,
            capture::ocr_status,
            capture::ocr_image,
            capture::open_windows_language_settings,
            titlebar::set_maximize_rect,
            commands::smart_target,
        ])
        .setup(|app| {
            tray::build(app.handle())?;
            let wanted = app.state::<AppState>().settings.lock().unwrap().launch_at_start;
            commands::apply_autostart(app.handle(), wanted);
            quick::reconfigure(app.handle());
            // Started by the autostart entry: stay in the tray.
            if !std::env::args().any(|a| a == "--hidden") {
                tray::show_main(app.handle());
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            quick::on_window_event(window, event);
            let WindowEvent::CloseRequested { api, .. } = event else { return };
            if window.label() != "main" {
                return;
            }
            let behavior = window.app_handle().state::<AppState>().settings.lock().unwrap().close_behavior.clone();
            api.prevent_close();
            match behavior.as_str() {
                "background" => {
                    let _ = window.hide();
                }
                "quit" => window.app_handle().exit(0),
                // The frontend shows the dialog and answers with `close_action`.
                _ => {
                    let _ = window.emit("close-requested", ());
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building Owl-L")
        .run(|app, event| {
            // Remove the keyboard hook before the process ends.
            if let tauri::RunEvent::Exit = event {
                quick::shutdown(app);
            }
        });
}
