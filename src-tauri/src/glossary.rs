//! The user's glossary: stored in Owl-L's data folder (`glossary.json`), applied by the engine to
//! every translation (text, quick popup, capture results and documents).

use std::sync::Mutex;

use dawn_translate::{Glossary, GlossaryEntry};
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::commands::{AppState, CmdResult};

pub struct GlossaryStore(Mutex<Glossary>);

fn path() -> std::path::PathBuf {
    dawn_core::app_dir("owll").join("glossary.json")
}

impl GlossaryStore {
    pub fn load() -> Self {
        let mut glossary: Glossary = dawn_core::read_json(&path());
        glossary.assign_ids();
        Self(Mutex::new(glossary))
    }
}

/// Give the engine the stored glossary (at startup and after every change).
pub fn apply(app: &AppHandle) {
    let glossary = app.state::<GlossaryStore>().0.lock().unwrap().clone();
    app.state::<AppState>().engine.set_glossary(glossary);
}

fn save_and_apply(app: &AppHandle, store: &GlossaryStore, glossary: Glossary) -> CmdResult<Glossary> {
    let mut glossary = glossary;
    glossary.assign_ids();
    dawn_core::write_json(&path(), &glossary)?;
    *store.0.lock().unwrap() = glossary.clone();
    apply(app);
    Ok(glossary)
}

#[tauri::command]
pub fn glossary_get(store: State<'_, GlossaryStore>) -> Glossary {
    store.0.lock().unwrap().clone()
}

/// Replace the whole glossary (the page edits it as a list and saves it).
#[tauri::command]
pub fn glossary_set(app: AppHandle, store: State<'_, GlossaryStore>, glossary: Glossary) -> CmdResult<Glossary> {
    save_and_apply(&app, &store, glossary)
}

#[derive(Serialize)]
pub struct ImportOut {
    added: usize,
    updated: usize,
    skipped: usize,
    glossary: Glossary,
}

/// Merge CSV text into the glossary: an entry with the same source and pair gets the new target.
#[tauri::command]
pub fn glossary_import_csv(app: AppHandle, store: State<'_, GlossaryStore>, text: String, from: String, to: String) -> CmdResult<ImportOut> {
    let default_pair = (!from.is_empty() && !to.is_empty()).then_some((from.as_str(), to.as_str()));
    let (entries, skipped) = Glossary::parse_csv(&text, default_pair);
    let mut glossary = store.0.lock().unwrap().clone();
    let (mut added, mut updated) = (0, 0);
    for entry in entries {
        match glossary.entries.iter_mut().find(|e| same_term(e, &entry)) {
            Some(existing) => {
                *existing = GlossaryEntry { id: existing.id, ..entry };
                updated += 1;
            }
            None => {
                glossary.entries.push(entry);
                added += 1;
            }
        }
    }
    let glossary = save_and_apply(&app, &store, glossary)?;
    Ok(ImportOut { added, updated, skipped, glossary })
}

fn same_term(a: &GlossaryEntry, b: &GlossaryEntry) -> bool {
    a.from == b.from && a.to == b.to && a.source.trim().to_lowercase() == b.source.trim().to_lowercase()
}

#[tauri::command]
pub fn glossary_export_csv(store: State<'_, GlossaryStore>) -> String {
    store.0.lock().unwrap().to_csv()
}

/// Delete every entry (the "Reset all settings" dialog offers this, after confirmation).
#[tauri::command]
pub fn glossary_clear(app: AppHandle, store: State<'_, GlossaryStore>) -> CmdResult<Glossary> {
    let enabled = store.0.lock().unwrap().enabled;
    save_and_apply(&app, &store, Glossary { enabled, entries: Vec::new() })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(source: &str, target: &str) -> GlossaryEntry {
        GlossaryEntry { id: 0, from: "en".into(), to: "de".into(), source: source.into(), target: target.into(), match_case: false, whole_word: true, enabled: true }
    }

    #[test]
    fn the_same_term_in_another_case_is_the_same_entry() {
        assert!(same_term(&entry("Owl", "Eule"), &entry(" owl ", "Kauz")));
        assert!(!same_term(&entry("owl", "Eule"), &GlossaryEntry { to: "fr".into(), ..entry("owl", "hibou") }));
    }
}
