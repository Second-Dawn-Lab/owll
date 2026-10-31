//! Owl-L backend: window/tray lifecycle, settings, history and the translation commands.

mod capture;
mod commands;
mod dict;
mod docs;
mod edit;
mod glossary;
mod history;
mod live;
mod ocr;
mod picker;
mod placement;
mod quick;
mod settings;
mod smart;
mod titlebar;
mod tray;
mod updates;
mod webview;

use tauri::{Emitter, Manager, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;

use commands::AppState;

pub fn run() {
    let (glossary_store, migrated_glossary) = glossary::GlossaryStore::load();
    tauri::Builder::default()
        // Must be registered first: a second launch just brings the running window forward.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| tray::show_main(app)))
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--hidden"])))
        // The only network access besides language pack downloads: asks GitHub for latest.json (see docs/releasing.md).
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(AppState::load())
        .manage(glossary_store)
        .manage(docs::DocJob::default())
        .manage(edit::EditSlot::default())
        .manage(dict::DictState::default())
        .manage(live::Live::new())
        .manage(picker::Picker::default())
        .plugin(tauri_plugin_dialog::init())
        .manage(quick::Quick::new())
        .manage(capture::Capture::new())
        .register_uri_scheme_protocol("owlcap", capture::serve)
        .invoke_handler(tauri::generate_handler![
            commands::translate,
            commands::detect_language,
            commands::alternatives,
            commands::sentence_alternatives,
            commands::pin_translation,
            glossary::glossaries_get,
            glossary::glossaries_set,
            glossary::glossary_set_active,
            glossary::glossary_import_csv,
            glossary::glossary_export_csv,
            glossary::glossary_clear,
            docs::doc_inspect,
            docs::doc_default_output,
            docs::doc_translate,
            docs::doc_cancel,
            picker::picker_open,
            picker::picker_spec,
            picker::picker_choose,
            picker::picker_close,
            live::live_state,
            live::live_toggle,
            live::live_stop,
            live::live_pause,
            live::live_lock,
            live::live_languages,
            live::live_change_region,
            live::live_replace_bar,
            live::live_close,
            live::live_save_session,
            live::live_set_save_choice,
            commands::history_session,
            live::live_save_text,
            dict::dict_list,
            dict::dict_lookup,
            dict::dict_install,
            dict::dict_cancel,
            dict::dict_remove,
            edit::edit_start,
            edit::edit_resume,
            edit::edit_draft_save,
            edit::edit_analyse,
            edit::edit_retranslate,
            edit::edit_save,
            edit::edit_close,
            edit::drafts_list,
            edit::draft_delete,
            docs::doc_open,
            docs::doc_show_in_folder,
            docs::read_dropped_file,
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
            capture::take_capture_result,
            capture::ocr_capture_again,
            capture::ocr_status,
            capture::ocr_image,
            capture::open_windows_language_settings,
            titlebar::set_maximize_rect,
            commands::smart_target,
            updates::update_check_due,
            updates::update_check_done,
        ])
        .setup(move |app| {
            tray::build(app.handle())?;
            glossary::adopt_migrated_choice(app.handle(), migrated_glossary.clone());
            glossary::apply(app.handle());
            for label in ["main", "quick"] {
                if let Some(window) = app.get_webview_window(label) {
                    webview::disable_browser_accelerators(&window);
                }
            }
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
            picker::on_window_event(window, event);
            live::on_window_event(window, event);
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
