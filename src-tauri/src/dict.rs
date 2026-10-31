//! The offline dictionary: packs for a language pair (both directions), lookup of a word and its base form.
//!
//! The work is done by `dawn-dict`; the packs go through the same download, checksum and install code as the language
//! packs (`dawn-models`), into their own folder. Nothing here uses the network except that download.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use dawn_dict::{Dict, Match};
use dawn_models::{Dictionary, InstallOptions, StepKind};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::commands::{AppState, CmdError, CmdResult};

/// Opened dictionary files by `from-to` ("de-en"): a pack is read once and kept while the app runs.
#[derive(Default)]
pub struct DictState {
    opened: Mutex<HashMap<String, Arc<Dict>>>,
    /// Packs being downloaded.
    installing: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DictInfo {
    id: String,
    languages: Vec<String>,
    size_bytes: u64,
    installed: bool,
    license: String,
    attribution: String,
    source_url: String,
    beta: bool,
    entries: u32,
}

fn info(state: &AppState, d: &Dictionary) -> DictInfo {
    DictInfo { id: d.id.clone(), languages: d.languages.clone(), size_bytes: d.size_bytes, installed: state.store.is_dictionary_installed(&d.id), license: d.license.clone(), attribution: d.attribution.clone(), source_url: d.source_url.clone(), beta: d.beta, entries: d.entries }
}

#[tauri::command]
pub fn dict_list(state: State<'_, AppState>) -> Vec<DictInfo> {
    state.catalog.dictionaries.iter().map(|d| info(&state, d)).collect()
}

#[derive(Serialize)]
pub struct WordOut {
    w: String,
    n: String,
}

#[derive(Serialize)]
pub struct SenseOut {
    gloss: String,
    words: Vec<WordOut>,
    tags: Vec<String>,
}

#[derive(Serialize)]
pub struct ExampleOut {
    text: String,
    translation: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntryOut {
    head: String,
    pos: String,
    grammar: String,
    senses: Vec<SenseOut>,
    examples: Vec<ExampleOut>,
    /// "head": the word is the headword; "form": it is an inflected form of it (the entry is its base form).
    matched: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LookupOut {
    /// "ok" (entries or none), "no_pack" (the pack is not installed: `pack` says which) or "unavailable" (no dictionary for the language).
    status: &'static str,
    pack: Option<DictInfo>,
    from: String,
    to: String,
    entries: Vec<EntryOut>,
    suggestions: Vec<String>,
}

fn entry_out(hit: dawn_dict::Hit) -> EntryOut {
    let e = hit.entry;
    EntryOut {
        head: e.head,
        pos: e.pos,
        grammar: e.grammar,
        senses: e.senses.into_iter().map(|s| SenseOut { gloss: s.gloss, words: s.words.into_iter().map(|w| WordOut { w: w.word, n: w.note }).collect(), tags: s.tags }).collect(),
        examples: e.examples.into_iter().map(|x| ExampleOut { text: x.text, translation: x.translation }).collect(),
        matched: if hit.matched == Match::Form { "form" } else { "head" },
    }
}

fn open_dict(state: &AppState, dict_state: &DictState, pack: &Dictionary, from: &str, to: &str) -> CmdResult<Arc<Dict>> {
    let key = format!("{from}-{to}");
    if let Some(d) = dict_state.opened.lock().unwrap().get(&key) {
        return Ok(d.clone());
    }
    let path: PathBuf = state.store.dictionary_dir(&pack.id).join(format!("{key}.dict"));
    let dict = Arc::new(Dict::open(&path).map_err(|e| CmdError::new("dictionary", e))?);
    dict_state.opened.lock().unwrap().insert(key, dict.clone());
    Ok(dict)
}

/// Which dictionary answers a lookup.
#[derive(Debug, PartialEq, Eq)]
pub enum LookupPlan {
    /// The installed pack `pack`, direction `lang` to `to`.
    Use { pack: String, to: String },
    /// The pack has to be downloaded first.
    Download { pack: String, to: String },
    /// No dictionary has this language.
    Unavailable,
}

/// The dictionary for a word of `lang` in a translation with `partner`: the pair's own, else the language with English
/// ("Meanings in English" when the partner is another language). An installed pack wins over one that still has to be
/// downloaded, and the pair's own wins over English.
pub fn plan_lookup(catalog: &dawn_models::Catalog, installed: &dyn Fn(&str) -> bool, lang: &str, partner: &str) -> LookupPlan {
    let mut missing: Option<LookupPlan> = None;
    for to in [partner, "en"] {
        if to == lang {
            continue;
        }
        let Some(pack) = catalog.dictionary_for(lang, to) else { continue };
        if installed(&pack.id) {
            return LookupPlan::Use { pack: pack.id.clone(), to: to.to_string() };
        }
        missing.get_or_insert(LookupPlan::Download { pack: pack.id.clone(), to: to.to_string() });
    }
    missing.unwrap_or(LookupPlan::Unavailable)
}

/// Look up `word`, written in `lang`, in the dictionary that translates `lang` into `partner` (the other language of the
/// translation), or into English when there is none for that pair. Slow the first time (the file is read).
#[tauri::command]
pub async fn dict_lookup(app: AppHandle, word: String, lang: String, partner: String) -> CmdResult<LookupOut> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let dict_state = app.state::<DictState>();
        match plan_lookup(&state.catalog, &|id: &str| state.store.is_dictionary_installed(id), &lang, &partner) {
            LookupPlan::Use { pack, to } => {
                let pack = state.catalog.dictionary(&pack).ok_or_else(|| CmdError::new("unknown_dictionary", &pack))?;
                let dict = open_dict(&state, &dict_state, pack, &lang, &to)?;
                let found = dict.lookup(&word).map_err(|e| CmdError::new("dictionary", e))?;
                Ok(LookupOut { status: "ok", pack: None, from: lang.clone(), to, entries: found.hits.into_iter().map(entry_out).collect(), suggestions: found.suggestions })
            }
            LookupPlan::Download { pack, to } => {
                let pack = state.catalog.dictionary(&pack).ok_or_else(|| CmdError::new("unknown_dictionary", &pack))?;
                Ok(LookupOut { status: "no_pack", pack: Some(info(&state, pack)), from: lang.clone(), to, entries: vec![], suggestions: vec![] })
            }
            LookupPlan::Unavailable => Ok(LookupOut { status: "unavailable", pack: None, from: lang.clone(), to: partner.clone(), entries: vec![], suggestions: vec![] }),
        }
    })
    .await
    .map_err(|e| CmdError::new("engine", e))?
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DictProgress {
    id: String,
    /// "downloading", "verifying", "extracting", "done", "failed" or "cancelled".
    step: &'static str,
    done: u64,
    total: u64,
    /// The error code of a failure.
    error: Option<String>,
}

/// Download and install a dictionary pack in the background; progress arrives as `dict-progress` events.
#[tauri::command]
pub fn dict_install(app: AppHandle, state: State<'_, AppState>, dict_state: State<'_, DictState>, id: String) -> CmdResult<()> {
    let pack = state.catalog.dictionary(&id).cloned().ok_or_else(|| CmdError::new("unknown_dictionary", &id))?;
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut jobs = dict_state.installing.lock().unwrap();
        if jobs.contains_key(&id) {
            return Ok(());
        }
        jobs.insert(id.clone(), cancel.clone());
    }
    let proxy = {
        let s = state.settings.lock().unwrap();
        (s.proxy_enabled && !s.proxy_url.trim().is_empty()).then(|| s.proxy_url.clone())
    };
    std::thread::spawn(move || {
        let state = app.state::<AppState>();
        let progress = |step: &'static str, done: u64, total: u64, error: Option<String>| {
            let _ = app.emit("dict-progress", DictProgress { id: pack.id.clone(), step, done, total, error });
        };
        progress("downloading", 0, pack.size_bytes, None);
        let mut last = Instant::now() - Duration::from_secs(1);
        let result = state.store.install_dictionary(&pack, &InstallOptions { proxy: proxy.as_deref(), cancel: &cancel }, &mut |step| match step {
            StepKind::Downloading(done, total) => {
                if last.elapsed() >= Duration::from_millis(150) || done >= total {
                    last = Instant::now();
                    progress("downloading", done, total, None);
                }
            }
            StepKind::Verifying => progress("verifying", 0, 0, None),
            StepKind::Extracting => progress("extracting", 0, 0, None),
        });
        app.state::<DictState>().installing.lock().unwrap().remove(&pack.id);
        match result {
            Ok(()) => {
                // A reinstall must not serve a file read before.
                app.state::<DictState>().opened.lock().unwrap().retain(|k, _| !pack.languages.iter().all(|l| k.contains(l.as_str())));
                progress("done", pack.size_bytes, pack.size_bytes, None);
            }
            Err(dawn_models::ModelError::Cancelled) => progress("cancelled", 0, 0, None),
            Err(err) => progress("failed", 0, 0, Some(err.code().to_string())),
        }
        let _ = app.emit("dict-changed", ());
    });
    Ok(())
}

#[tauri::command]
pub fn dict_cancel(dict_state: State<'_, DictState>, id: String) {
    if let Some(cancel) = dict_state.installing.lock().unwrap().get(&id) {
        cancel.store(true, std::sync::atomic::Ordering::Relaxed);
    }
}

#[tauri::command]
pub fn dict_remove(app: AppHandle, state: State<'_, AppState>, dict_state: State<'_, DictState>, id: String) -> CmdResult<()> {
    let pack = state.catalog.dictionary(&id).cloned().ok_or_else(|| CmdError::new("unknown_dictionary", &id))?;
    dict_state.opened.lock().unwrap().retain(|k, _| !pack.languages.iter().all(|l| k.contains(l.as_str())));
    state.store.remove_dictionary(&id)?;
    let _ = app.emit("dict-changed", ());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn catalog(pairs: &[(&str, &str)]) -> dawn_models::Catalog {
        let mut c = dawn_models::Catalog::default();
        for (a, b) in pairs {
            let mut ids = [a.to_string(), b.to_string()];
            ids.sort();
            c.dictionaries.push(Dictionary { id: ids.join("-"), languages: vec![a.to_string(), b.to_string()], urls: vec![], size_bytes: 1, sha256: String::new(), license: "CC-BY-SA-4.0".into(), attribution: String::new(), source_url: String::new(), beta: false, entries: 0 });
        }
        c
    }

    #[test]
    fn the_pairs_own_pack_answers_when_it_is_installed() {
        let c = catalog(&[("de", "en"), ("en", "fr")]);
        assert_eq!(plan_lookup(&c, &|_| true, "de", "en"), LookupPlan::Use { pack: "de-en".into(), to: "en".into() });
        assert_eq!(plan_lookup(&c, &|_| true, "en", "fr"), LookupPlan::Use { pack: "en-fr".into(), to: "fr".into() });
    }

    #[test]
    fn a_pair_without_english_uses_the_language_with_english_and_says_so() {
        // A German word in a German to French translation: no de-fr pack, so the German to English one ("Meanings in English").
        let c = catalog(&[("de", "en"), ("en", "fr")]);
        assert_eq!(plan_lookup(&c, &|_| true, "de", "fr"), LookupPlan::Use { pack: "de-en".into(), to: "en".into() });
        assert_eq!(plan_lookup(&c, &|_| true, "fr", "de"), LookupPlan::Use { pack: "en-fr".into(), to: "en".into() });
    }

    #[test]
    fn a_missing_pack_is_offered_and_an_installed_fallback_beats_a_missing_exact_pair() {
        let c = catalog(&[("de", "en"), ("en", "fr")]);
        assert_eq!(plan_lookup(&c, &|_| false, "de", "fr"), LookupPlan::Download { pack: "de-en".into(), to: "en".into() });
        let both = catalog(&[("de", "fr"), ("de", "en")]);
        assert_eq!(plan_lookup(&both, &|id| id == "de-en", "de", "fr"), LookupPlan::Use { pack: "de-en".into(), to: "en".into() });
        assert_eq!(plan_lookup(&both, &|_| false, "de", "fr"), LookupPlan::Download { pack: "de-fr".into(), to: "fr".into() });
    }

    #[test]
    fn a_language_without_any_dictionary_is_unavailable_and_a_language_is_not_a_pair_with_itself() {
        let c = catalog(&[("de", "en")]);
        assert_eq!(plan_lookup(&c, &|_| true, "ur", "en"), LookupPlan::Unavailable);
        assert_eq!(plan_lookup(&c, &|_| true, "en", "en"), LookupPlan::Unavailable);
    }
}
