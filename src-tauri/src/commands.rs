//! Tauri commands: the only surface the frontend talks to.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use dawn_models::{Catalog, InstallOptions, ModelError, ModelStore, Step};
use dawn_translate::{Ct2Engine, Ct2Options, Pass, TranslateError, TranslateOptions};
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_autostart::ManagerExt;

use crate::history::{Entry, History};
use crate::settings::Settings;
use crate::tray;

/// Set DAWN_TRACE=1 to log request timings to stderr (see `trace`).
pub(crate) fn trace_enabled() -> bool {
    std::env::var_os("DAWN_TRACE").is_some()
}

pub(crate) fn trace_line(msg: &str) {
    static START: OnceLock<Instant> = OnceLock::new();
    let start = START.get_or_init(Instant::now);
    eprintln!("[trace {:>9.3}s] {msg}", start.elapsed().as_secs_f64());
}

/// Lets the frontend add its own timestamps to the backend trace (dev builds only call this).
#[tauri::command]
pub fn trace(msg: String) {
    if trace_enabled() {
        trace_line(&format!("ui: {msg}"));
    }
}

pub struct AppState {
    pub settings: Mutex<Settings>,
    pub history: Mutex<History>,
    /// Page the settings window should open on (read once by the window when it loads).
    pub settings_page: Mutex<Option<String>>,
    pub catalog: Arc<Catalog>,
    pub store: ModelStore,
    pub engine: Arc<Ct2Engine>,
    /// Running language installs, by language code, with their cancel flags.
    jobs: Mutex<HashMap<String, Arc<AtomicBool>>>,
    /// Cancel flag of the newest translation request; a new request cancels the previous one.
    translate_cancel: Mutex<Arc<AtomicBool>>,
    /// "Activate the other languages this download made available?" questions, taken once by a window.
    offers: Mutex<Vec<ActivationOffer>>,
    /// The language detected last (short texts fall back to it).
    last_detected: Mutex<Option<String>>,
}

impl AppState {
    pub fn load() -> Self {
        let catalog = Arc::new(Catalog::bundled());
        let store = ModelStore::open_default();
        let engine = Arc::new(Ct2Engine::new(store.clone(), catalog.clone(), &Ct2Options::default()));
        let settings = Settings::load();
        engine.set_threads(settings.translation_threads as usize);
        Self {
            settings: Mutex::new(settings),
            history: Mutex::new(History::load()),
            settings_page: Mutex::new(None),
            catalog,
            store,
            engine,
            jobs: Mutex::new(HashMap::new()),
            translate_cancel: Mutex::new(Arc::new(AtomicBool::new(false))),
            offers: Mutex::new(Vec::new()),
            last_detected: Mutex::new(None),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct CmdError {
    pub code: String,
    pub message: String,
}

impl CmdError {
    pub(crate) fn new(code: &str, message: impl ToString) -> Self {
        Self { code: code.into(), message: message.to_string() }
    }
}

impl From<std::io::Error> for CmdError {
    fn from(e: std::io::Error) -> Self {
        Self::new("io", e)
    }
}

impl From<serde_json::Error> for CmdError {
    fn from(e: serde_json::Error) -> Self {
        Self::new("bad_request", e)
    }
}

impl From<ModelError> for CmdError {
    fn from(e: ModelError) -> Self {
        Self::new(e.code(), e)
    }
}

pub(crate) type CmdResult<T> = Result<T, CmdError>;

// --- translation -----------------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslateOut {
    text: String,
    /// The text went through English.
    pivoted: bool,
    /// The translated sentences, for word alternatives.
    segments: Vec<SegmentOut>,
    /// How many glossary terms were put into the text.
    glossary_hits: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SegmentOut {
    source: String,
    /// What the last model stage read (the source, or English after a pivot).
    input: String,
    target: String,
    /// Position of `target` in the text, in UTF-16 units.
    start: usize,
    end: usize,
    /// The user picked this sentence from the alternatives.
    pinned: bool,
}

impl From<dawn_translate::Translation> for TranslateOut {
    fn from(t: dawn_translate::Translation) -> Self {
        Self {
            text: t.text,
            pivoted: t.pivoted,
            segments: t.segments.into_iter().map(|s| SegmentOut { source: s.source, input: s.input, target: s.target, start: s.start, end: s.end, pinned: s.pinned }).collect(),
            glossary_hits: t.glossary_hits,
        }
    }
}

#[derive(Serialize)]
pub struct AlternativeOut {
    word: String,
    text: String,
}

/// Alternatives for the word after `prefix` in the translation of `input` (a segment's `input`).
/// Slow the first time (the model is loaded for it), so it runs off the UI thread.
#[tauri::command]
pub async fn alternatives(state: State<'_, AppState>, from: String, to: String, input: String, prefix: String, current: String) -> CmdResult<Vec<AlternativeOut>> {
    let engine = state.engine.clone();
    let catalog = state.catalog.clone();
    let started = Instant::now();
    let found = tauri::async_runtime::spawn_blocking(move || engine.alternatives(&from, &to, &input, &prefix, 5))
        .await
        .map_err(|e| CmdError::new("engine", e))?
        .map_err(|e| translate_error(&catalog, e))?;
    if trace_enabled() {
        trace_line(&format!("backend: alternatives in {} ms", started.elapsed().as_millis()));
    }
    Ok(dawn_translate::dedupe_alternatives(found, &current, 5).into_iter().map(|a| AlternativeOut { word: a.word, text: a.text }).collect())
}

/// Keep the user's pick for a sentence, so live re-translation does not undo it.
#[tauri::command]
pub fn pin_translation(state: State<'_, AppState>, from: String, to: String, source: String, input: String, translation: String) {
    state.engine.pin(&from, &to, &source, &input, &translation);
}

fn translate_error(catalog: &Catalog, err: TranslateError) -> CmdError {
    match err {
        // The message is the language code the user needs to download.
        TranslateError::ModelMissing(lang) => CmdError::new("pack_missing", lang),
        // The message is the language whose models need repairing (re-downloading).
        TranslateError::ModelLoad { model, reason } => {
            eprintln!("could not load model {model}: {reason}");
            let lang = catalog.language_for_model(&model).map(|l| l.code.clone()).unwrap_or_default();
            CmdError::new("model_load", lang)
        }
        TranslateError::Cancelled => CmdError::new("cancelled", ""),
        TranslateError::Engine(why) => CmdError::new("engine", why),
    }
}

/// Sent after every finished batch so the result pane can fill in progressively.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TranslateProgress {
    request_id: u64,
    text: String,
    /// "fast": a quick draft; "refine": the final pass replacing the draft.
    pass: &'static str,
    done: usize,
    total: usize,
    pivoted: bool,
    /// A complete draft is already showing; this pass replaces it quietly.
    draft_shown: bool,
}

/// Translate with streaming: `translate-progress` events carry partial results, the return
/// value is the final text. A newer request cancels this one (it then fails with "cancelled").
#[tauri::command]
pub async fn translate(app: AppHandle, state: State<'_, AppState>, request_id: u64, text: String, from: String, to: String) -> CmdResult<TranslateOut> {
    if from == "auto" {
        return Err(CmdError::new("bad_request", "source language must be resolved first"));
    }
    // Latest request wins: abandon the previous one, which is usually stale (live typing).
    let cancel = {
        let mut current = state.translate_cancel.lock().unwrap();
        current.store(true, Ordering::Relaxed);
        let fresh = Arc::new(AtomicBool::new(false));
        *current = fresh.clone();
        fresh
    };
    let engine = state.engine.clone();
    let catalog = state.catalog.clone();
    let options = if state.settings.lock().unwrap().two_pass { TranslateOptions::with_draft() } else { TranslateOptions::default() };
    let chars = text.chars().count();
    if trace_enabled() {
        trace_line(&format!("backend: translate #{request_id} start {from}->{to}, {chars} chars"));
    }
    let started = Instant::now();
    tauri::async_runtime::spawn_blocking(move || {
        let result = engine.translate_streaming(&text, &from, &to, &cancel, &options, &mut |update| {
            if trace_enabled() {
                trace_line(&format!(
                    "backend: #{request_id} {:?} {}/{} sentences at {} ms",
                    update.pass,
                    update.done,
                    update.total,
                    started.elapsed().as_millis()
                ));
            }
            let _ = app.emit(
                "translate-progress",
                TranslateProgress {
                    request_id,
                    text: update.text,
                    pass: if update.pass == Pass::Fast { "fast" } else { "refine" },
                    done: update.done,
                    total: update.total,
                    pivoted: update.pivoted,
                    draft_shown: update.draft_shown,
                },
            );
        });
        if trace_enabled() {
            trace_line(&format!("backend: #{request_id} finished in {} ms ({})", started.elapsed().as_millis(), if result.is_ok() { "ok" } else { "cancelled/failed" }));
        }
        result
    })
    .await
    .map_err(|e| CmdError::new("engine", e))?
    .map(TranslateOut::from)
    .map_err(|e| translate_error(&catalog, e))
}

/// "ok": `code` is the language (installed or not); "unsure": too little to go on; "none": no letters.
#[derive(Serialize)]
pub struct DetectOut {
    status: &'static str,
    code: Option<String>,
}

#[tauri::command]
pub fn detect_language(state: State<'_, AppState>, text: String) -> DetectOut {
    let started = Instant::now();
    let active = state.engine.installed_languages();
    // Short texts lean on the language the user was just working in.
    let mut last = state.last_detected.lock().unwrap();
    let picked = state.settings.lock().unwrap().source_language.clone();
    let hint = last.clone().or_else(|| (picked != "auto").then_some(picked));
    let found = dawn_translate::detect_in_context(&text, &active, hint.as_deref());
    if let dawn_translate::Detection::Language(code) = &found {
        *last = Some(code.clone());
    }
    if trace_enabled() {
        trace_line(&format!("backend: detect_language {} chars -> {found:?} in {} us", text.chars().count(), started.elapsed().as_micros()));
    }
    match found {
        dawn_translate::Detection::Language(code) => DetectOut { status: "ok", code: Some(code) },
        dawn_translate::Detection::Unsure => DetectOut { status: "unsure", code: None },
        dawn_translate::Detection::NoText => DetectOut { status: "none", code: None },
    }
}

/// The target to use so that a text is never translated into its own language.
#[tauri::command]
pub fn smart_target(state: State<'_, AppState>, source: String, target: String) -> String {
    crate::smart::smart_target(&source, &target, &state.settings.lock().unwrap().last_foreign_target)
}

// --- languages and packs ---------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    id: String,
    sources: Vec<String>,
    targets: Vec<String>,
    size_bytes: u64,
    license: String,
    attribution: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanguageInfo {
    code: String,
    name: String,
    native_name: String,
    /// Quality is known to be unreliable (shown as a "Beta" badge).
    beta: bool,
    /// Active: shown in the pickers.
    installed: bool,
    /// All its models are on disk (it may be inactive; activating is instant).
    available: bool,
    /// Other languages that use the same models ("Included with Urdu"), active ones first.
    included_with: Vec<String>,
    /// English: always available, nothing to download.
    built_in: bool,
    downloading: bool,
    /// What still has to be downloaded for this language. 0 when its models are already
    /// installed for another language (they are shared).
    size_bytes: u64,
    /// All of its models, installed or not.
    total_bytes: u64,
    /// Disk space freed by removing it (models no other installed language needs).
    freeable_bytes: u64,
    models: Vec<ModelInfo>,
}

#[tauri::command]
pub fn list_languages(state: State<'_, AppState>) -> Vec<LanguageInfo> {
    let catalog = &state.catalog;
    let jobs = state.jobs.lock().unwrap();
    let hub = LanguageInfo {
        code: catalog.hub.clone(),
        name: "English".into(),
        native_name: "English".into(),
        beta: false,
        installed: true,
        available: true,
        included_with: vec![],
        built_in: true,
        downloading: false,
        size_bytes: 0,
        total_bytes: 0,
        freeable_bytes: 0,
        models: vec![],
    };
    let rest = catalog.languages.iter().map(|l| {
        let sizes = state.store.language_sizes(catalog, &l.code);
        LanguageInfo {
            code: l.code.clone(),
            name: l.name.clone(),
            native_name: l.native_name.clone(),
            beta: l.beta,
            installed: state.store.is_language_installed(catalog, &l.code),
            available: state.store.is_language_available(catalog, &l.code),
            included_with: shared_with(&state.store, catalog, &l.code),
            built_in: false,
            downloading: jobs.contains_key(&l.code),
            size_bytes: sizes.download,
            total_bytes: sizes.total,
            freeable_bytes: sizes.freeable,
            models: catalog
                .language_models(&l.code)
                .into_iter()
                .map(|m| ModelInfo {
                    id: m.id.clone(),
                    sources: m.sources.clone(),
                    targets: m.targets.clone(),
                    size_bytes: m.size_bytes,
                    license: m.license.clone(),
                    attribution: m.attribution.clone(),
                })
                .collect(),
        }
    });
    std::iter::once(hub).chain(rest).collect()
}

/// Other languages that use at least one of the same models, active ones first.
fn shared_with(store: &ModelStore, catalog: &Catalog, code: &str) -> Vec<String> {
    let mine: Vec<&String> = catalog.language(code).map(|l| l.models.iter().collect()).unwrap_or_default();
    let mut others: Vec<(bool, String)> = catalog
        .languages
        .iter()
        .filter(|o| o.code != code && o.models.iter().any(|m| mine.contains(&m)))
        .map(|o| (!store.is_language_installed(catalog, &o.code), o.code.clone()))
        .collect();
    others.sort();
    others.into_iter().map(|(_, code)| code).collect()
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ActivationOffer {
    /// The language that was just downloaded.
    code: String,
    /// Other languages its models support, not active yet.
    languages: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeactivateOut {
    /// Models no active language needs any more; the UI offers to delete them.
    model_ids: Vec<String>,
    freed_bytes: u64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PackProgress {
    code: String,
    /// downloading | verifying | extracting | done | cancelled | error
    phase: &'static str,
    done: u64,
    total: u64,
    error_code: Option<String>,
    error: Option<String>,
}

impl PackProgress {
    fn new(code: &str, phase: &'static str) -> Self {
        Self { code: code.into(), phase, done: 0, total: 0, error_code: None, error: None }
    }
}

fn proxy_from(settings: &Settings) -> Option<String> {
    (settings.proxy_enabled && !settings.proxy_url.trim().is_empty()).then(|| settings.proxy_url.clone())
}

/// Start downloading a language in the background; progress arrives as `pack-progress` events.
fn start_install(app: &AppHandle, code: &str) -> CmdResult<()> {
    let state = app.state::<AppState>();
    if state.catalog.language(code).is_none() {
        return Err(CmdError::new("unknown_language", code));
    }
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut jobs = state.jobs.lock().unwrap();
        if jobs.contains_key(code) {
            return Ok(());
        }
        jobs.insert(code.to_string(), cancel.clone());
    }
    let proxy = proxy_from(&state.settings.lock().unwrap());
    let (app, code) = (app.clone(), code.to_string());

    std::thread::spawn(move || {
        let state = app.state::<AppState>();
        let _ = app.emit("pack-progress", PackProgress::new(&code, "downloading"));
        let mut last_emit = Instant::now() - Duration::from_secs(1);
        let result = state.store.install_language(
            &state.catalog,
            &code,
            &InstallOptions { proxy: proxy.as_deref(), cancel: &cancel },
            &mut |step| {
                let event = match step {
                    Step::Downloading { done, total } => {
                        if last_emit.elapsed() < Duration::from_millis(120) && done < total {
                            return;
                        }
                        last_emit = Instant::now();
                        PackProgress { done, total, ..PackProgress::new(&code, "downloading") }
                    }
                    Step::Verifying => PackProgress::new(&code, "verifying"),
                    Step::Extracting => PackProgress::new(&code, "extracting"),
                };
                let _ = app.emit("pack-progress", event);
            },
        );
        state.jobs.lock().unwrap().remove(&code);
        let last = match result {
            Ok(()) => {
                if let Ok(languages) = state.store.activation_offer(&state.catalog, &code) {
                    if !languages.is_empty() {
                        state.offers.lock().unwrap().push(ActivationOffer { code: code.clone(), languages });
                        let _ = app.emit("activation-offer", ());
                    }
                }
                PackProgress::new(&code, "done")
            }
            Err(ModelError::Cancelled) => PackProgress::new(&code, "cancelled"),
            Err(err) => PackProgress { error_code: Some(err.code().into()), error: Some(err.to_string()), ..PackProgress::new(&code, "error") },
        };
        let _ = app.emit("pack-progress", last);
        let _ = app.emit("packs-changed", ());
    });
    Ok(())
}

#[tauri::command]
pub fn install_language(app: AppHandle, code: String) -> CmdResult<()> {
    start_install(&app, &code)
}

#[tauri::command]
pub fn cancel_install(state: State<'_, AppState>, code: String) {
    if let Some(flag) = state.jobs.lock().unwrap().get(&code) {
        flag.store(true, Ordering::Relaxed);
    }
}

/// Show a language whose files are already on disk in the pickers.
#[tauri::command]
pub fn activate_language(app: AppHandle, state: State<'_, AppState>, code: String) -> CmdResult<()> {
    state.store.activate_language(&state.catalog, &code)?;
    let _ = app.emit("packs-changed", ());
    Ok(())
}

#[tauri::command]
pub fn activate_languages(app: AppHandle, state: State<'_, AppState>, codes: Vec<String>) -> CmdResult<()> {
    for code in codes {
        state.store.activate_language(&state.catalog, &code)?;
    }
    let _ = app.emit("packs-changed", ());
    Ok(())
}

/// Hide a language from the pickers; its files stay. The answer lists models nobody needs any
/// more, so the UI can offer to delete them.
#[tauri::command]
pub fn deactivate_language(app: AppHandle, state: State<'_, AppState>, code: String) -> CmdResult<DeactivateOut> {
    let model_ids = state.store.deactivate_language(&state.catalog, &code)?;
    let freed_bytes = model_ids.iter().filter_map(|id| state.catalog.model(id)).map(|m| m.size_bytes).sum();
    let _ = app.emit("packs-changed", ());
    Ok(DeactivateOut { model_ids, freed_bytes })
}

/// Delete model files no active language needs. Returns the bytes freed.
#[tauri::command]
pub async fn delete_model_files(app: AppHandle, ids: Vec<String>) -> CmdResult<u64> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        // Release file handles on the models before deleting their folders.
        state.engine.unload_all();
        let freed = state.store.delete_orphaned(&state.catalog, &ids)?;
        let _ = app.emit("packs-changed", ());
        Ok(freed)
    })
    .await
    .map_err(|e| CmdError::new("io", e))?
}

/// The next pending "activate the other languages?" question, if any (each is handed out once).
#[tauri::command]
pub fn take_activation_offer(state: State<'_, AppState>) -> Option<ActivationOffer> {
    let mut offers = state.offers.lock().unwrap();
    (!offers.is_empty()).then(|| offers.remove(0))
}

/// Delete a language's files (including ones shared with other languages) and download them again.
#[tauri::command]
pub async fn repair_language(app: AppHandle, code: String) -> CmdResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        state.engine.unload_all();
        state.engine.clear_cache();
        state.store.delete_language_files(&state.catalog, &code)?;
        start_install(&app, &code)
    })
    .await
    .map_err(|e| CmdError::new("io", e))?
}

// --- settings --------------------------------------------------------------

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Settings {
    state.settings.lock().unwrap().clone()
}

#[tauri::command]
pub fn set_settings(app: AppHandle, state: State<'_, AppState>, patch: Value) -> CmdResult<Settings> {
    let updated = {
        let mut settings = state.settings.lock().unwrap();
        // Check the whole result first: a bad shortcut must not be saved.
        let mut next = settings.clone();
        next.merge(patch)?;
        crate::quick::normalize(&mut next)?;
        if next.target_language != "en" {
            next.last_foreign_target = next.target_language.clone();
        }
        next.save()?;
        *settings = next;
        settings.clone()
    };
    crate::quick::reconfigure(&app);
    apply_autostart(&app, updated.launch_at_start);
    state.engine.set_threads(updated.translation_threads as usize);
    let _ = app.emit("settings-changed", &updated);
    Ok(updated)
}

pub fn apply_autostart(app: &AppHandle, wanted: bool) {
    let manager = app.autolaunch();
    if manager.is_enabled().unwrap_or(false) == wanted {
        return;
    }
    let result = if wanted { manager.enable() } else { manager.disable() };
    if let Err(err) = result {
        eprintln!("could not update launch-at-start: {err}");
    }
}

// --- history ---------------------------------------------------------------

#[tauri::command]
pub fn history_list(state: State<'_, AppState>) -> Vec<Entry> {
    state.history.lock().unwrap().list()
}

#[tauri::command]
pub fn history_add(app: AppHandle, state: State<'_, AppState>, from: String, to: String, source: String, result: String) -> CmdResult<()> {
    if !state.settings.lock().unwrap().keep_history {
        return Ok(());
    }
    state.history.lock().unwrap().add(from, to, source, result)?;
    let _ = app.emit("history-changed", ());
    Ok(())
}

#[tauri::command]
pub fn history_delete(app: AppHandle, state: State<'_, AppState>, id: u64) -> CmdResult<()> {
    state.history.lock().unwrap().delete(id)?;
    let _ = app.emit("history-changed", ());
    Ok(())
}

#[tauri::command]
pub fn history_clear(app: AppHandle, state: State<'_, AppState>) -> CmdResult<()> {
    state.history.lock().unwrap().clear()?;
    let _ = app.emit("history-changed", ());
    Ok(())
}

// --- windows ---------------------------------------------------------------

#[tauri::command]
pub fn open_settings(app: AppHandle, page: Option<String>) {
    tray::open_settings_window(&app, page);
}

/// The settings window asks for its starting page once, when it loads.
#[tauri::command]
pub fn take_settings_page(state: State<'_, AppState>) -> Option<String> {
    state.settings_page.lock().unwrap().take()
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub fn set_tray_language(app: AppHandle, lang: String) {
    tray::set_language(&app, &lang);
}

/// Answer to the "close window?" dialog: "background" or "quit".
#[tauri::command]
pub fn close_action(app: AppHandle, state: State<'_, AppState>, action: String, remember: bool) -> CmdResult<()> {
    if remember {
        let updated = {
            let mut settings = state.settings.lock().unwrap();
            settings.close_behavior = action.clone();
            settings.save()?;
            settings.clone()
        };
        let _ = app.emit("settings-changed", &updated);
    }
    if action == "quit" {
        app.exit(0);
    } else if let Some(w) = app.get_webview_window("main") {
        let _ = w.hide();
    }
    Ok(())
}
