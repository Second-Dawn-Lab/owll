//! App settings, persisted as JSON in the Owl-L data folder.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub launch_at_start: bool,
    /// "ask" | "background" | "quit"
    pub close_behavior: String,
    /// "popup" | "app"
    pub quick_access: String,
    pub ignore_quick_access_without_selection: bool,
    pub floating_icon: bool,
    pub translate_shortcut_enabled: bool,
    pub translate_shortcut: String,
    pub capture_shortcut_enabled: bool,
    pub capture_shortcut: String,
    /// "light" | "dark" | "system"
    pub theme: String,
    /// "system" | "en" | "de"
    pub ui_language: String,
    /// "ask" or a folder path
    pub download_location: String,
    pub keep_history: bool,
    pub capture_languages: Vec<String>,
    pub block_list: Vec<String>,
    pub proxy_enabled: bool,
    pub proxy_url: String,
    /// CPU threads per translation model; 0 = automatic (about two thirds of the cores).
    pub translation_threads: u32,
    /// Show a quick beam-1 draft first, then replace it with the beam-2 translation.
    pub two_pass: bool,
    /// Last used languages ("auto" = detect).
    pub source_language: String,
    pub target_language: String,
    /// The last target the user picked that was not English (for "never translate X to X").
    pub last_foreign_target: String,
    /// Unix time of the last update check (0 = never); see `updates.rs`.
    pub last_update_check: u64,
    /// The first-run welcome has been shown (or skipped).
    pub onboarding_done: bool,
    /// Where an area capture shows its result: "main" (the Images tab) | "popup" (the small quick window).
    pub capture_result_in: String,
    /// The glossary in use ("" = none): shared by the Text tab, the Files tab and the quick popup.
    pub glossary_active: String,
    /// The last answer to the PDF question: "docx" (convert to Word) | "pdf" (keep as PDF).
    pub pdf_output: String,
    /// Ask that question before every batch with PDFs.
    pub pdf_ask: bool,
    /// The target language of the Files tab ("" = not chosen yet: it starts as the Text tab's target). Separate
    /// from `target_language`, so neither tab changes the other's choice.
    pub files_target_language: String,
    pub live_shortcut_enabled: bool,
    pub live_shortcut: String,
    /// How often live captions look at the region: "calm" | "normal" | "fast".
    pub live_speed: String,
    /// Translated lines the caption bar shows (1 to 3).
    pub live_lines: u32,
    /// Font size of the translation in the bar, logical pixels.
    pub live_font_size: u32,
    /// Opacity of the bar's background, 0.3 to 1.
    pub live_opacity: f64,
    /// A small line with the original text above the translation.
    pub live_show_original: bool,
    /// What to do with the conversation when a live session ends: "ask" | "always" | "never".
    pub live_save_choice: String,
    /// The size the user gave the caption bar, logical pixels (0: automatic).
    pub live_bar_width: u32,
    pub live_bar_height: u32,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            launch_at_start: false,
            close_behavior: "ask".into(),
            quick_access: "popup".into(),
            ignore_quick_access_without_selection: false,
            floating_icon: false,
            translate_shortcut_enabled: true,
            translate_shortcut: "Ctrl+C C".into(),
            capture_shortcut_enabled: true,
            capture_shortcut: "Ctrl+Shift+O".into(),
            theme: "system".into(),
            ui_language: "system".into(),
            download_location: "ask".into(),
            keep_history: true,
            // Empty = automatic: English plus the active languages.
            capture_languages: vec![],
            block_list: vec![],
            proxy_enabled: false,
            proxy_url: String::new(),
            translation_threads: 0,
            two_pass: false,
            source_language: "auto".into(),
            target_language: "de".into(),
            last_foreign_target: "de".into(),
            last_update_check: 0,
            onboarding_done: false,
            capture_result_in: "main".into(),
            glossary_active: String::new(),
            pdf_output: "docx".into(),
            pdf_ask: true,
            files_target_language: String::new(),
            live_shortcut_enabled: true,
            live_shortcut: "Ctrl+Shift+L".into(),
            live_speed: "normal".into(),
            live_lines: 2,
            live_font_size: 28,
            live_opacity: 0.82,
            live_show_original: false,
            live_save_choice: "ask".into(),
            live_bar_width: 0,
            live_bar_height: 0,
        }
    }
}

impl Settings {
    pub fn path() -> PathBuf {
        dawn_core::app_dir("owll").join("settings.json")
    }

    pub fn load() -> Self {
        let mut s: Self = dawn_core::read_json(&Self::path());
        s.migrate();
        s
    }

    /// Settings files from before area selection existed carry placeholder values.
    fn migrate(&mut self) {
        if !self.capture_shortcut_enabled && self.capture_shortcut == "Ctrl+F8" {
            self.capture_shortcut_enabled = true;
            self.capture_shortcut = "Ctrl+Shift+O".into();
        }
        if self.capture_languages == ["en"] {
            self.capture_languages.clear();
        }
    }

    pub fn save(&self) -> std::io::Result<()> {
        dawn_core::write_json(&Self::path(), self)
    }

    /// Merge a partial JSON object into the settings (unknown keys are ignored).
    pub fn merge(&mut self, patch: Value) -> Result<(), serde_json::Error> {
        let mut current = serde_json::to_value(&*self)?;
        if let (Value::Object(base), Value::Object(extra)) = (&mut current, patch) {
            base.extend(extra);
        }
        *self = serde_json::from_value(current)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn old_placeholder_capture_settings_are_migrated() {
        let mut old: Settings = serde_json::from_str(r#"{"captureShortcutEnabled":false,"captureShortcut":"Ctrl+F8","captureLanguages":["en"]}"#).unwrap();
        old.migrate();
        assert!(old.capture_shortcut_enabled);
        assert_eq!(old.capture_shortcut, "Ctrl+Shift+O");
        assert!(old.capture_languages.is_empty(), "the old default [\"en\"] means automatic");
    }

    #[test]
    fn chosen_capture_settings_are_kept() {
        let mut chosen: Settings =
            serde_json::from_str(r#"{"captureShortcutEnabled":false,"captureShortcut":"Ctrl+Alt+K","captureLanguages":["de","fr"]}"#).unwrap();
        chosen.migrate();
        assert!(!chosen.capture_shortcut_enabled);
        assert_eq!(chosen.capture_shortcut, "Ctrl+Alt+K");
        assert_eq!(chosen.capture_languages, ["de", "fr"]);
    }
}
