//! The user's glossaries: several named lists (for example "My business glossary"), each with its own
//! entries, stored in Owl-L's data folder (`glossary.json`). One of them is *active* (or none): the engine
//! applies the active list to every translation (text, quick popup, capture results and documents).
//! The choice is kept in the settings (`glossaryActive`), so the quick popup follows the last choice.

use std::sync::Mutex;

use dawn_translate::{Glossary, GlossaryEntry};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::commands::{AppState, CmdError, CmdResult};

/// The name of the list that holds the entries of the single glossary of v0.2.0-beta files.
pub const MIGRATED_NAME: &str = "My glossary";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NamedGlossary {
    pub id: String,
    pub name: String,
    /// The language pair new entries of this list start with (each entry still has its own pair).
    #[serde(default)]
    pub from: Option<String>,
    #[serde(default)]
    pub to: Option<String>,
    #[serde(default)]
    pub entries: Vec<GlossaryEntry>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Glossaries {
    pub lists: Vec<NamedGlossary>,
}

impl Glossaries {
    /// Read a stored file. The first version stored one flat glossary (`{"enabled": true, "entries": [...]}`);
    /// its entries become one list called "My glossary". Returns the lists and, for a migrated file, whether the
    /// old glossary was switched on (then that list is the active one).
    pub fn from_json(value: Value) -> (Self, Option<bool>) {
        if value.get("lists").is_some() {
            return (serde_json::from_value(value).unwrap_or_default(), None);
        }
        let Some(entries) = value.get("entries").and_then(|e| serde_json::from_value::<Vec<GlossaryEntry>>(e.clone()).ok()) else {
            return (Self::default(), None);
        };
        let enabled = value.get("enabled").and_then(Value::as_bool).unwrap_or(true);
        let mut lists = Self::default();
        if !entries.is_empty() {
            lists.lists.push(NamedGlossary { id: "g1".into(), name: MIGRATED_NAME.into(), from: None, to: None, entries });
        }
        (lists, Some(enabled))
    }

    /// Give every entry of every list an id, and every list a unique id.
    pub fn tidy(&mut self) {
        let mut taken: Vec<String> = Vec::new();
        let mut next = 1;
        for list in &mut self.lists {
            if list.id.trim().is_empty() || taken.contains(&list.id) {
                while taken.contains(&format!("g{next}")) {
                    next += 1;
                }
                list.id = format!("g{next}");
            }
            taken.push(list.id.clone());
            let mut g = Glossary { enabled: true, entries: std::mem::take(&mut list.entries) };
            g.assign_ids();
            list.entries = g.entries;
            list.name = list.name.trim().to_string();
            if list.name.is_empty() {
                list.name = "Glossary".into();
            }
        }
    }

    pub fn find(&self, id: &str) -> Option<&NamedGlossary> {
        self.lists.iter().find(|l| l.id == id)
    }

    /// What the engine applies for the chosen list: its entries, or nothing when no list is chosen or it is gone.
    pub fn engine_glossary(&self, active: &str) -> Glossary {
        match self.find(active) {
            Some(list) => Glossary { enabled: true, entries: list.entries.clone() },
            None => Glossary { enabled: false, entries: Vec::new() },
        }
    }
}

pub struct GlossaryStore(Mutex<Glossaries>);

fn path() -> std::path::PathBuf {
    dawn_core::app_dir("owll").join("glossary.json")
}

impl GlossaryStore {
    /// Load the file, migrating the first format. The second value is the active list a migration implies.
    pub fn load() -> (Self, Option<String>) {
        let value: Value = dawn_core::read_json(&path());
        let (mut lists, migrated_enabled) = Glossaries::from_json(value);
        lists.tidy();
        let active = match migrated_enabled {
            Some(true) => lists.lists.first().map(|l| l.id.clone()),
            _ => None,
        };
        if migrated_enabled.is_some() {
            // Write the new format right away so the old file is not migrated twice.
            let _ = dawn_core::write_json(&path(), &lists);
        }
        (Self(Mutex::new(lists)), active)
    }
}

/// Give the engine the active list (at startup and after every change).
pub fn apply(app: &AppHandle) {
    let active = app.state::<AppState>().settings.lock().unwrap().glossary_active.clone();
    let glossary = app.state::<GlossaryStore>().0.lock().unwrap().engine_glossary(&active);
    app.state::<AppState>().engine.set_glossary(glossary);
    let _ = app.emit("glossary-changed", ());
}

/// A migrated glossary stays switched on: remember its list as the active one (once, at startup).
pub fn adopt_migrated_choice(app: &AppHandle, active: Option<String>) {
    let Some(id) = active else { return };
    let state = app.state::<AppState>();
    let mut settings = state.settings.lock().unwrap();
    if settings.glossary_active.is_empty() {
        settings.glossary_active = id;
        let _ = settings.save();
    }
}

fn save_and_apply(app: &AppHandle, store: &GlossaryStore, mut lists: Glossaries) -> CmdResult<Glossaries> {
    lists.tidy();
    dawn_core::write_json(&path(), &lists)?;
    *store.0.lock().unwrap() = lists.clone();
    // A deleted active list switches the glossary off.
    let state = app.state::<AppState>();
    {
        let mut settings = state.settings.lock().unwrap();
        if !settings.glossary_active.is_empty() && lists.find(&settings.glossary_active).is_none() {
            settings.glossary_active.clear();
            let _ = settings.save();
            let _ = app.emit("settings-changed", &*settings);
        }
    }
    apply(app);
    Ok(lists)
}

#[tauri::command]
pub fn glossaries_get(store: State<'_, GlossaryStore>) -> Glossaries {
    store.0.lock().unwrap().clone()
}

/// Replace all lists (the page edits them as a whole and saves).
#[tauri::command]
pub fn glossaries_set(app: AppHandle, store: State<'_, GlossaryStore>, glossaries: Glossaries) -> CmdResult<Glossaries> {
    save_and_apply(&app, &store, glossaries)
}

/// Switch to another list, or off (an empty id). The choice is shared by the Text tab, the Files tab and the quick popup.
#[tauri::command]
pub fn glossary_set_active(app: AppHandle, state: State<'_, AppState>, store: State<'_, GlossaryStore>, id: String) -> CmdResult<()> {
    if !id.is_empty() && store.0.lock().unwrap().find(&id).is_none() {
        return Err(CmdError::new("bad_request", "unknown glossary"));
    }
    {
        let mut settings = state.settings.lock().unwrap();
        settings.glossary_active = id;
        settings.save()?;
        let _ = app.emit("settings-changed", &*settings);
    }
    apply(&app);
    Ok(())
}

#[derive(Serialize)]
pub struct ImportOut {
    added: usize,
    updated: usize,
    skipped: usize,
    glossaries: Glossaries,
}

/// Merge CSV text into one list: an entry with the same source and pair gets the new target.
#[tauri::command]
pub fn glossary_import_csv(app: AppHandle, store: State<'_, GlossaryStore>, list: String, text: String, from: String, to: String) -> CmdResult<ImportOut> {
    let default_pair = (!from.is_empty() && !to.is_empty()).then_some((from.as_str(), to.as_str()));
    let (entries, skipped) = Glossary::parse_csv(&text, default_pair);
    let mut glossaries = store.0.lock().unwrap().clone();
    let Some(target) = glossaries.lists.iter_mut().find(|l| l.id == list) else { return Err(CmdError::new("bad_request", "unknown glossary")) };
    let (mut added, mut updated) = (0, 0);
    for entry in entries {
        match target.entries.iter_mut().find(|e| same_term(e, &entry)) {
            Some(existing) => {
                *existing = GlossaryEntry { id: existing.id, ..entry };
                updated += 1;
            }
            None => {
                target.entries.push(entry);
                added += 1;
            }
        }
    }
    let glossaries = save_and_apply(&app, &store, glossaries)?;
    Ok(ImportOut { added, updated, skipped, glossaries })
}

fn same_term(a: &GlossaryEntry, b: &GlossaryEntry) -> bool {
    a.from == b.from && a.to == b.to && a.source.trim().to_lowercase() == b.source.trim().to_lowercase()
}

#[tauri::command]
pub fn glossary_export_csv(store: State<'_, GlossaryStore>, list: String) -> CmdResult<String> {
    let glossaries = store.0.lock().unwrap();
    let list = glossaries.find(&list).ok_or_else(|| CmdError::new("bad_request", "unknown glossary"))?;
    Ok(Glossary { enabled: true, entries: list.entries.clone() }.to_csv())
}

/// Delete every list (the "Reset all settings" dialog offers this, after confirmation).
#[tauri::command]
pub fn glossary_clear(app: AppHandle, store: State<'_, GlossaryStore>) -> CmdResult<Glossaries> {
    save_and_apply(&app, &store, Glossaries::default())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn entry(source: &str, target: &str) -> GlossaryEntry {
        GlossaryEntry { id: 0, from: "en".into(), to: "de".into(), source: source.into(), target: target.into(), match_case: false, whole_word: true, enabled: true }
    }

    #[test]
    fn the_same_term_in_another_case_is_the_same_entry() {
        assert!(same_term(&entry("Owl", "Eule"), &entry(" owl ", "Kauz")));
        assert!(!same_term(&entry("owl", "Eule"), &GlossaryEntry { to: "fr".into(), ..entry("owl", "hibou") }));
    }

    #[test]
    fn the_old_single_glossary_becomes_one_named_list_and_stays_switched_on() {
        let old = json!({ "enabled": true, "entries": [
            { "id": 4, "from": "en", "to": "de", "source": "owl", "target": "Eule", "matchCase": false, "wholeWord": true, "enabled": true },
            { "id": 9, "from": "en", "to": "de", "source": "fox", "target": "Fuchs", "matchCase": true, "wholeWord": false, "enabled": false }
        ]});
        let (mut lists, enabled) = Glossaries::from_json(old);
        lists.tidy();
        assert_eq!(enabled, Some(true));
        assert_eq!(lists.lists.len(), 1);
        assert_eq!(lists.lists[0].name, MIGRATED_NAME);
        assert_eq!(lists.lists[0].id, "g1");
        assert_eq!(lists.lists[0].entries.len(), 2);
        assert_eq!((lists.lists[0].entries[0].id, lists.lists[0].entries[1].source.as_str()), (4, "fox"), "entries keep their data and ids");
        assert!(lists.lists[0].entries[1].match_case && !lists.lists[0].entries[1].enabled);
    }

    #[test]
    fn a_switched_off_or_empty_old_glossary_migrates_to_no_active_list() {
        let (lists, enabled) = Glossaries::from_json(json!({ "enabled": false, "entries": [{ "from": "en", "to": "de", "source": "a", "target": "b" }] }));
        assert_eq!((lists.lists.len(), enabled), (1, Some(false)));
        let (empty, enabled) = Glossaries::from_json(json!({ "enabled": true, "entries": [] }));
        assert!(empty.lists.is_empty());
        assert_eq!(enabled, Some(true));
        assert_eq!(Glossaries::from_json(json!({})), (Glossaries::default(), None));
    }

    #[test]
    fn the_new_format_is_read_as_it_is() {
        let new = json!({ "lists": [{ "id": "g7", "name": "Business", "from": "en", "to": "de", "entries": [] }] });
        let (lists, migrated) = Glossaries::from_json(new);
        assert_eq!(migrated, None);
        assert_eq!((lists.lists[0].id.as_str(), lists.lists[0].name.as_str()), ("g7", "Business"));
    }

    #[test]
    fn tidy_gives_unique_ids_names_and_entry_ids() {
        let mut g = Glossaries {
            lists: vec![
                NamedGlossary { id: "".into(), name: " ".into(), from: None, to: None, entries: vec![entry("a", "b"), entry("c", "d")] },
                NamedGlossary { id: "g1".into(), name: "Two".into(), from: None, to: None, entries: vec![] },
                NamedGlossary { id: "g1".into(), name: "Three".into(), from: None, to: None, entries: vec![] },
            ],
        };
        g.tidy();
        let ids: Vec<&str> = g.lists.iter().map(|l| l.id.as_str()).collect();
        assert_eq!(ids.len(), 3);
        assert!(ids[0] != ids[1] && ids[1] != ids[2] && ids[0] != ids[2], "{ids:?}");
        assert_eq!(g.lists[0].name, "Glossary");
        assert_eq!(g.lists[0].entries.iter().map(|e| e.id).collect::<Vec<_>>(), [1, 2]);
    }

    #[test]
    fn the_engine_gets_only_the_active_list() {
        let g = Glossaries {
            lists: vec![
                NamedGlossary { id: "a".into(), name: "A".into(), from: None, to: None, entries: vec![entry("owl", "Eule")] },
                NamedGlossary { id: "b".into(), name: "B".into(), from: None, to: None, entries: vec![entry("fox", "Fuchs")] },
            ],
        };
        let for_b = g.engine_glossary("b");
        assert!(for_b.enabled);
        assert_eq!(for_b.for_pair("en", "de").len(), 1);
        assert_eq!(for_b.entries[0].source, "fox");
        assert!(!g.engine_glossary("").enabled, "no choice means off");
        assert!(!g.engine_glossary("gone").enabled, "a deleted list means off");
    }
}
