//! Settings of the web view that Tauri does not expose.

use tauri::WebviewWindow;

/// Turn off WebView2's browser accelerator keys (Ctrl+Shift+O, Ctrl+F, Ctrl+P, F5, F12, ...) for a window.
/// Owl-L is an app, not a browser: those shortcuts do nothing useful, and one of them is the capture
/// shortcut. Text editing keys (Ctrl+C, V, X, Z, Y, A, Ctrl+Shift+arrows) are not accelerators and keep working.
#[cfg(windows)]
pub fn disable_browser_accelerators(window: &WebviewWindow) {
    let _ = window.with_webview(|webview| {
        use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
        use windows_core::Interface;
        // SAFETY: the controller and settings are valid COM objects of the live web view; the calls only read
        // them and set one boolean.
        unsafe {
            if let Ok(core) = webview.controller().CoreWebView2() {
                if let Ok(settings) = core.Settings() {
                    if let Ok(settings3) = settings.cast::<ICoreWebView2Settings3>() {
                        let _ = settings3.SetAreBrowserAcceleratorKeysEnabled(false);
                    }
                }
            }
        }
    });
}

#[cfg(not(windows))]
pub fn disable_browser_accelerators(_: &WebviewWindow) {}
