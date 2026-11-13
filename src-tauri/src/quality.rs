//! Quality mode: the commands around `dawn-llm`. Optional and off by default. The model is loaded by the first request
//! and freed after an idle time; nothing here runs at app start except a sweeper thread that checks the idle time.
//! Only this computer is contacted (the local runtime, or a local Ollama); the downloads of the runtime and the model
//! go through the same checked download code as the language packs.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use dawn_llm::{
    check_memory, ollama_models, select_backend, tasks, tone_available, Availability, Choice, Config, Endpoint, Llm, LlmError, MemoryVerdict, Selected, SidecarSpec, Term, Tone,
    WriteKind,
};
use dawn_models::{InstallOptions, LlmPack, StepKind};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::commands::{trace_enabled, trace_line, AppState, CmdError, CmdResult};
use crate::settings::Settings;

#[derive(Default)]
pub struct Quality {
    llm: Llm,
    /// Cancel flag of the newest polish / write request; a new one cancels the previous one.
    cancel: Mutex<Arc<AtomicBool>>,
    /// Running downloads, by the id of the pack the user asked for, with their cancel flags.
    installing: Mutex<HashMap<String, Arc<AtomicBool>>>,
    /// The latest progress of every download (kept, so a page opened during a download shows it at once).
    progress: Mutex<HashMap<String, QualityProgress>>,
}

impl Quality {
    fn next_cancel(&self) -> Arc<AtomicBool> {
        let mut current = self.cancel.lock().unwrap();
        current.store(true, Ordering::Relaxed);
        let fresh = Arc::new(AtomicBool::new(false));
        *current = fresh.clone();
        fresh
    }

    pub fn unload(&self) {
        self.llm.unload();
    }
}

/// A sweeper that frees the model after the idle time. It starts with the app but loads nothing. The model is loaded
/// again by the next request (`Llm::complete`); the windows are told whenever it loads or is freed.
pub fn start_idle_sweeper(app: &AppHandle) {
    let notify = app.clone();
    app.state::<Quality>().llm.set_observer(Arc::new(move || {
        let _ = notify.emit("quality-changed", ());
    }));
    let app = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(30));
        let minutes = app.state::<AppState>().settings.lock().unwrap().quality_idle_minutes.max(1);
        app.state::<Quality>().llm.unload_if_idle(Duration::from_secs(u64::from(minutes) * 60), Instant::now());
    });
}

// --- configuration -----------------------------------------------------------------

/// A model as the choice sees it.
#[derive(Debug, Clone, Copy)]
pub struct Candidate<'a> {
    pub id: &'a str,
    pub tier: &'a str,
    pub installed: bool,
    /// The model writes the language of the task well enough.
    pub covers: bool,
}

const TIER_ORDER: [&str; 3] = ["recommended", "alternative", "writing"];

/// The model to translate (polish) with: the chosen one when it is installed and good in the language, else the first
/// installed one in the order recommended, alternative, writing. `None`: no installed model can do the task.
pub fn choose_model<'a>(candidates: &[Candidate<'a>], chosen: &str) -> Option<&'a str> {
    let usable = |c: &&Candidate<'a>| c.installed && c.covers;
    candidates
        .iter()
        .filter(usable)
        .find(|c| c.id == chosen)
        .map(|c| c.id)
        .or_else(|| TIER_ORDER.iter().find_map(|t| candidates.iter().filter(usable).find(|c| c.tier == *t).map(|c| c.id)))
}

/// The model for the Write tab: the writing model when it is installed and good in the language, else any usable one.
pub fn choose_writer<'a>(candidates: &[Candidate<'a>]) -> Option<&'a str> {
    candidates.iter().find(|c| c.tier == "writing" && c.installed && c.covers).map(|c| c.id).or_else(|| choose_model(candidates, ""))
}

fn candidates<'a>(state: &'a AppState, lang: &str) -> Vec<Candidate<'a>> {
    state
        .catalog
        .llm_models()
        .into_iter()
        .map(|p| Candidate { id: &p.id, tier: &p.tier, installed: state.store.llm_file(p).is_some(), covers: lang.is_empty() || p.covers(lang) })
        .collect()
}

/// The installed model polish uses for text that is translated into `lang` ("" = any language).
pub fn pack_for<'a>(state: &'a AppState, settings: &Settings, lang: &str) -> Option<&'a LlmPack> {
    choose_model(&candidates(state, lang), &settings.quality_model).and_then(|id| state.catalog.llm(id))
}

/// The installed model the Write tab uses for text in `lang`.
pub fn write_pack<'a>(state: &'a AppState, lang: &str) -> Option<&'a LlmPack> {
    choose_writer(&candidates(state, lang)).and_then(|id| state.catalog.llm(id))
}

fn choice_of(mode: &str) -> Choice {
    match mode {
        "builtin" => Choice::Builtin,
        "ollama" => Choice::Ollama,
        _ => Choice::Off,
    }
}

fn config_for(state: &AppState, pack: Option<&LlmPack>) -> Config {
    let s = state.settings.lock().unwrap().clone();
    let builtin = (|| {
        let runtime = state.catalog.llm_runtime()?;
        let pack = pack?;
        Some(SidecarSpec { exe: state.store.llm_file(runtime)?, model: state.store.llm_file(pack)?, threads: 0, context: 4096 })
    })();
    Config { choice: choice_of(&s.quality_mode), builtin, builtin_ram: pack.map_or(0, |p| p.ram_bytes), ollama_endpoint: s.ollama_endpoint, ollama_model: s.ollama_model }
}

/// The configuration of Quality mode for any language (the status line, the readiness checks).
pub fn config(state: &AppState) -> Config {
    let settings = state.settings.lock().unwrap().clone();
    config_for(state, pack_for(state, &settings, ""))
}

/// The configuration for polishing text translated into `lang`: the installed model that can do it.
pub fn config_for_lang(state: &AppState, lang: &str) -> Config {
    let settings = state.settings.lock().unwrap().clone();
    config_for(state, pack_for(state, &settings, lang))
}

/// The configuration for the Write tab.
pub fn write_config(state: &AppState, lang: &str) -> Config {
    config_for(state, write_pack(state, lang))
}

/// The built-in models are only asked for languages they write well (Ollama models are the user's choice). When models are
/// installed but none of them is good in `lang`, polishing is skipped and the fast translation stays.
pub fn language_gate(state: &AppState, lang: &str) -> Result<(), CmdError> {
    let settings = state.settings.lock().unwrap().clone();
    if settings.quality_mode != "builtin" || pack_for(state, &settings, lang).is_some() {
        return Ok(());
    }
    let names: Vec<&str> = state.catalog.llm_models().into_iter().filter(|p| state.store.llm_file(p).is_some()).map(|p| p.name.as_str()).collect();
    if names.is_empty() {
        return Ok(()); // nothing installed at all: `usable` says so
    }
    Err(CmdError::new("quality_unsupported_language", format!("{} does not write this language well, so the fast translation is shown", names.join(" and "))))
}

fn availability(state: &AppState, cfg: &Config) -> Availability {
    let ollama_models = if cfg.choice == Choice::Ollama {
        Endpoint::parse(&cfg.ollama_endpoint).ok().and_then(|e| ollama_models(&e).ok()).map(|m| m.into_iter().map(|m| m.name).collect())
    } else {
        None
    };
    let _ = state;
    Availability { builtin_installed: cfg.builtin.is_some(), ollama_models }
}

/// Is Quality mode switched on and usable? (cheap for the built-in backend; one local request for Ollama)
fn usable(state: &AppState, cfg: &Config) -> Result<(), String> {
    match select_backend(cfg.choice, &cfg.ollama_model, &availability(state, cfg)) {
        Selected::Off => Err("off".into()),
        Selected::Unavailable(why) => Err(why),
        Selected::BuiltIn | Selected::Ollama { .. } => Ok(()),
    }
}

fn llm_error(e: LlmError) -> CmdError {
    match e {
        LlmError::Cancelled => CmdError::new("cancelled", ""),
        other => CmdError::new(&format!("quality_{}", other.code().replace('-', "_")), other.to_string()),
    }
}

// --- what is set up, in one word ------------------------------------------------------

/// What the status line needs to decide.
#[derive(Debug, Clone, Copy, Default)]
pub struct StateInput {
    /// "off" | "builtin" | "ollama".
    pub builtin: bool,
    pub ollama: bool,
    pub downloading: bool,
    pub model_installed: bool,
    pub runtime_installed: bool,
    pub loading: bool,
    pub loaded: bool,
    pub ollama_running: bool,
    pub ollama_has_models: bool,
    pub ollama_model_chosen: bool,
}

/// The state shown on the settings page and what is missing: `("not_set_up", "model")`. States: `off`, `not_set_up`,
/// `downloading`, `ready`, `loading`, `loaded`, `unavailable`. Only what is really missing is named: with the engine
/// installed and no model, the engine is never asked for again.
pub fn status_state(i: StateInput) -> (&'static str, &'static str) {
    if !i.builtin && !i.ollama {
        return ("off", "");
    }
    if i.ollama {
        return match (i.ollama_running, i.ollama_has_models, i.ollama_model_chosen) {
            (false, _, _) => ("unavailable", "ollama"),
            (true, false, _) => ("unavailable", "ollama_models"),
            (true, true, false) => ("not_set_up", "ollama_model"),
            _ if i.loading => ("loading", ""),
            _ if i.loaded => ("loaded", ""),
            _ => ("ready", ""),
        };
    }
    if i.downloading {
        return ("downloading", "");
    }
    if !i.model_installed {
        return ("not_set_up", "model");
    }
    if !i.runtime_installed {
        return ("not_set_up", "engine");
    }
    if i.loading {
        ("loading", "")
    } else if i.loaded {
        ("loaded", "")
    } else {
        ("ready", "")
    }
}

/// The downloads one click starts: a model brings the engine (runtime) with it when that is missing, engine first.
pub fn install_plan(runtime: Option<&LlmPack>, runtime_installed: bool, pack: &LlmPack) -> Vec<LlmPack> {
    let mut plan = Vec::new();
    if !pack.is_runtime() && !runtime_installed {
        plan.extend(runtime.cloned());
    }
    plan.push(pack.clone());
    plan
}

/// A smoothed download speed in bytes per second.
#[derive(Debug, Default)]
pub struct SpeedMeter {
    last: Option<(u64, u64)>,
    speed: f64,
}

impl SpeedMeter {
    /// `now_ms` and the bytes done so far; returns the speed. Updated at most every 400 ms.
    pub fn update(&mut self, now_ms: u64, done: u64) -> u64 {
        match self.last {
            None => self.last = Some((now_ms, done)),
            Some((t, d)) if now_ms >= t + 400 => {
                let current = done.saturating_sub(d) as f64 * 1000.0 / (now_ms - t) as f64;
                self.speed = if self.speed == 0.0 { current } else { self.speed * 0.7 + current * 0.3 };
                self.last = Some((now_ms, done));
            }
            _ => {}
        }
        self.speed as u64
    }
}

// --- status for the settings page --------------------------------------------------

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PackInfo {
    id: String,
    name: String,
    tier: String,
    description: String,
    details: String,
    size_bytes: u64,
    ram_bytes: u64,
    installed: bool,
    installing: bool,
    license: String,
    attribution: String,
    source_url: String,
    /// The languages the model is used for; empty = all.
    languages: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OllamaInfo {
    running: bool,
    models: Vec<dawn_llm::OllamaModel>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryOut {
    total: u64,
    available: u64,
    /// Less than 16 GB installed: a warning is shown.
    low_total: bool,
    /// The chosen model would not fit into the free memory right now.
    too_little_free: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QualityStatus {
    runtime: Option<PackInfo>,
    models: Vec<PackInfo>,
    /// The translation model in use: the chosen one when it is installed, else the best installed one.
    selected_model: String,
    /// The model the user chose (it may not be installed).
    requested_model: String,
    /// The Write tab's model (tier `writing`).
    writing: Option<PackInfo>,
    ollama: OllamaInfo,
    memory: Option<MemoryOut>,
    /// The model is in memory right now.
    loaded: bool,
    /// `off`, `not_set_up`, `downloading`, `ready`, `loading`, `loaded` or `unavailable`.
    state: &'static str,
    /// What is missing: `model`, `engine`, `ollama`, `ollama_models`, `ollama_model` or empty.
    missing: &'static str,
    /// Quality mode is on and can be used right now (`ready`, `loading` or `loaded`).
    ready: bool,
    /// Latest progress of the running downloads, by the pack id the user asked for.
    progress: Vec<QualityProgress>,
}

fn pack_info(state: &AppState, quality: &Quality, p: &LlmPack) -> PackInfo {
    PackInfo {
        id: p.id.clone(),
        name: p.name.clone(),
        tier: p.tier.clone(),
        description: p.description.clone(),
        details: p.details.clone(),
        size_bytes: p.size_bytes,
        ram_bytes: p.ram_bytes,
        installed: state.store.llm_file(p).is_some(),
        installing: quality.installing.lock().unwrap().contains_key(&p.id),
        license: p.license.clone(),
        attribution: p.attribution.clone(),
        source_url: p.source_url.clone(),
        languages: p.languages.clone(),
    }
}

#[tauri::command]
pub async fn quality_status(app: AppHandle) -> CmdResult<QualityStatus> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let quality = app.state::<Quality>();
        let settings = state.settings.lock().unwrap().clone();
        let endpoint = Endpoint::parse(&settings.ollama_endpoint).ok();
        // Ollama is only asked when it is the chosen engine (or the page is about to offer it).
        let ollama_list = if settings.quality_mode == "ollama" { endpoint.as_ref().and_then(|e| ollama_models(e).ok()) } else { None };
        // The model in use is an installed one; with nothing installed the recommended one is what the page talks about.
        let in_use = pack_for(&state, &settings, "");
        let pack = in_use.or_else(|| state.catalog.llm_models().into_iter().find(|p| p.tier == "recommended"));
        let memory = dawn_llm::system_memory().map(|m| MemoryOut {
            total: m.total,
            available: m.available,
            low_total: matches!(check_memory(0, m), MemoryVerdict::LowTotal),
            too_little_free: pack.is_some_and(|p| matches!(check_memory(p.ram_bytes, m), MemoryVerdict::TooLittleFree { .. })),
        });
        let installing = !quality.installing.lock().unwrap().is_empty();
        let ollama_names: Vec<String> = ollama_list.as_ref().map(|l| l.iter().map(|m| m.name.clone()).collect()).unwrap_or_default();
        let (st, missing) = status_state(StateInput {
            builtin: settings.quality_mode == "builtin",
            ollama: settings.quality_mode == "ollama",
            downloading: installing,
            model_installed: in_use.is_some(),
            runtime_installed: state.catalog.llm_runtime().is_some_and(|r| state.store.llm_file(r).is_some()),
            loading: quality.llm.is_loading(),
            loaded: quality.llm.is_loaded(),
            ollama_running: ollama_list.is_some(),
            ollama_has_models: !ollama_names.is_empty(),
            ollama_model_chosen: ollama_names.iter().any(|n| *n == settings.ollama_model),
        });
        let mut progress: Vec<QualityProgress> = quality.progress.lock().unwrap().values().cloned().collect();
        progress.sort_by(|a, b| a.id.cmp(&b.id));
        QualityStatus {
            runtime: state.catalog.llm_runtime().map(|p| pack_info(&state, &quality, p)),
            models: state.catalog.llm_models().into_iter().map(|p| pack_info(&state, &quality, p)).collect(),
            selected_model: in_use.map(|p| p.id.clone()).unwrap_or_default(),
            requested_model: settings.quality_model.clone(),
            writing: state.catalog.llm_writing().map(|p| pack_info(&state, &quality, p)),
            ollama: OllamaInfo { running: ollama_list.is_some(), models: ollama_list.unwrap_or_default() },
            memory,
            loaded: quality.llm.is_loaded(),
            state: st,
            missing,
            ready: matches!(st, "ready" | "loading" | "loaded"),
            progress,
        }
    })
    .await
    .map_err(|e| CmdError::new("engine", e))
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct QualityProgress {
    /// The pack the user asked for (a model); its engine download is reported under the same id with `part` "engine".
    id: String,
    /// "engine" or "model".
    part: &'static str,
    /// "downloading" | "verifying" | "extracting" | "done" | "cancelled" | "failed".
    step: &'static str,
    done: u64,
    total: u64,
    /// Bytes per second, smoothed.
    speed: u64,
    error: Option<String>,
}

/// Download and install a model, or the runtime. A model brings the engine along when it is missing (one click). Progress
/// arrives as `quality-progress` events and is kept for `quality_status`.
#[tauri::command]
pub fn quality_install(app: AppHandle, state: State<'_, AppState>, quality: State<'_, Quality>, id: String) -> CmdResult<()> {
    let pack = state.catalog.llm(&id).cloned().ok_or_else(|| CmdError::new("unknown_pack", &id))?;
    let runtime_installed = state.catalog.llm_runtime().is_some_and(|r| state.store.llm_file(r).is_some());
    let plan = install_plan(state.catalog.llm_runtime(), runtime_installed, &pack);
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut jobs = quality.installing.lock().unwrap();
        if jobs.contains_key(&id) {
            return Ok(());
        }
        jobs.insert(id.clone(), cancel.clone());
    }
    quality.progress.lock().unwrap().remove(&id);
    let proxy = {
        let s = state.settings.lock().unwrap();
        (s.proxy_enabled && !s.proxy_url.trim().is_empty()).then(|| s.proxy_url.clone())
    };
    std::thread::spawn(move || {
        let state = app.state::<AppState>();
        let mut outcome: Result<(), dawn_models::ModelError> = Ok(());
        let mut last_step: &'static str = "downloading";
        for part in &plan {
            let part_name: &'static str = if part.is_runtime() { "engine" } else { "model" };
            let report = |step: &'static str, done: u64, total: u64, speed: u64, error: Option<String>| {
                let p = QualityProgress { id: id.clone(), part: part_name, step, done, total, speed, error };
                app.state::<Quality>().progress.lock().unwrap().insert(id.clone(), p.clone());
                let _ = app.emit("quality-progress", p);
            };
            report("downloading", 0, part.size_bytes, 0, None);
            let started = Instant::now();
            let mut meter = SpeedMeter::default();
            let mut last = Instant::now() - Duration::from_secs(1);
            outcome = state.store.install_llm(part, &InstallOptions { proxy: proxy.as_deref(), cancel: &cancel }, &mut |step| match step {
                StepKind::Downloading(done, total) => {
                    let speed = meter.update(started.elapsed().as_millis() as u64, done);
                    if last.elapsed() >= Duration::from_millis(250) || done >= total {
                        last = Instant::now();
                        report("downloading", done, total, speed, None);
                    }
                }
                StepKind::Verifying => report("verifying", 0, 0, 0, None),
                StepKind::Extracting => report("extracting", 0, 0, 0, None),
            });
            match &outcome {
                Ok(()) => last_step = "done",
                Err(dawn_models::ModelError::Cancelled) => {
                    last_step = "cancelled";
                    break;
                }
                Err(err) => {
                    report("failed", 0, 0, 0, Some(err.code().to_string()));
                    last_step = "failed";
                    break;
                }
            }
            if !std::ptr::eq(part, plan.last().unwrap()) {
                // The next part (the model) starts; the engine is done and shown as installed.
                let _ = app.emit("quality-changed", ());
            }
        }
        app.state::<Quality>().installing.lock().unwrap().remove(&id);
        if last_step == "done" || last_step == "cancelled" {
            app.state::<Quality>().progress.lock().unwrap().remove(&id);
        }
        if last_step == "done" {
            let _ = app.emit("quality-progress", QualityProgress { id: id.clone(), part: "model", step: "done", done: 0, total: 0, speed: 0, error: None });
        } else if last_step == "cancelled" {
            let _ = app.emit("quality-progress", QualityProgress { id: id.clone(), part: "model", step: "cancelled", done: 0, total: 0, speed: 0, error: None });
        }
        let _ = outcome;
        let _ = app.emit("quality-changed", ());
    });
    Ok(())
}

#[tauri::command]
pub fn quality_cancel(quality: State<'_, Quality>, id: String) {
    if let Some(cancel) = quality.installing.lock().unwrap().get(&id) {
        cancel.store(true, Ordering::Relaxed);
    }
}

#[tauri::command]
pub fn quality_remove(app: AppHandle, state: State<'_, AppState>, quality: State<'_, Quality>, id: String) -> CmdResult<()> {
    quality.unload(); // the file may be in use by the running runtime
    state.store.remove_llm(&id).map_err(|e| CmdError::new("remove_failed", e.to_string()))?;
    let _ = app.emit("quality-changed", ());
    Ok(())
}

/// Free the model from memory now.
#[tauri::command]
pub fn quality_unload(app: AppHandle, quality: State<'_, Quality>) {
    quality.unload();
    let _ = app.emit("quality-changed", ());
}

// --- polish ------------------------------------------------------------------------

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SegmentIo {
    source: String,
    input: String,
    target: String,
    /// Positions in the text, UTF-16 units.
    start: usize,
    end: usize,
    pinned: bool,
    /// The fast engine could not translate this sentence cleanly: the model does not start from it.
    #[serde(default)]
    unclean: bool,
}

impl SegmentIo {
    pub fn new(source: &str, input: &str, target: &str, start: usize, end: usize, pinned: bool, unclean: bool) -> Self {
        Self { source: source.into(), input: input.into(), target: target.into(), start, end, pinned, unclean }
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TermIo {
    start: usize,
    end: usize,
    source: String,
    target: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PolishOut {
    text: String,
    segments: Vec<SegmentIo>,
    glossary_terms: Vec<TermIo>,
    /// Sentences the model changed.
    polished: usize,
    /// Sentences whose answer was rejected or failed (the fast translation stays).
    kept: usize,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PolishProgress {
    request_id: u64,
    #[serde(flatten)]
    out: PolishOut,
    done: usize,
    total: usize,
}

fn parse_tone(tone: &str) -> Tone {
    match tone {
        "formal" => Tone::Formal,
        "informal" => Tone::Informal,
        _ => Tone::Automatic,
    }
}

/// The text with the sentence `i` replaced: the gaps between the sentences come from the original text.
/// `text` and the positions are in UTF-16 units; returns the new text and the segments with their new positions.
pub fn assemble(text: &str, segments: &[SegmentIo], targets: &[String]) -> (String, Vec<SegmentIo>) {
    let units: Vec<u16> = text.encode_utf16().collect();
    let slice = |a: usize, b: usize| String::from_utf16_lossy(&units[a.min(units.len())..b.min(units.len())]);
    let mut out = String::new();
    let mut out_len = 0usize;
    let mut cursor = 0usize;
    let mut result = Vec::with_capacity(segments.len());
    for (seg, target) in segments.iter().zip(targets) {
        let gap = slice(cursor, seg.start.max(cursor));
        out_len += gap.encode_utf16().count();
        out.push_str(&gap);
        let start = out_len;
        out.push_str(target);
        out_len += target.encode_utf16().count();
        result.push(SegmentIo { target: target.clone(), start, end: out_len, ..seg.clone() });
        cursor = seg.end.max(cursor);
    }
    out.push_str(&slice(cursor, units.len()));
    (out, result)
}

/// Where the glossary targets stand in the segments' targets (UTF-16 positions in the whole text). A term is found as
/// written or by its stem, since the model inflects it ("Eule" in "Eulen").
fn locate_terms(state: &AppState, from: &str, to: &str, segments: &[SegmentIo]) -> Vec<TermIo> {
    let mut found = Vec::new();
    for seg in segments {
        let lower = seg.target.to_lowercase();
        // Lowercasing can change the length (e.g. "İ"), then positions cannot be trusted: skip highlighting.
        if lower.chars().count() != seg.target.chars().count() {
            continue;
        }
        let chars: Vec<char> = lower.chars().collect();
        for form in state.engine.glossary_terms_in(from, to, &seg.source) {
            let (source, target) = (form.found, form.target);
            let t: Vec<char> = target.to_lowercase().chars().collect();
            let needles: Vec<&[char]> = if t.len() >= 5 { vec![&t[..], &t[..t.len() - 1]] } else { vec![&t[..]] };
            for needle in needles {
                if needle.is_empty() {
                    continue;
                }
                if let Some(pos) = chars.windows(needle.len()).position(|w| w == needle) {
                    // Extend over the rest of the word (the inflected ending).
                    let mut end = pos + needle.len();
                    while end < chars.len() && chars[end].is_alphabetic() && end - pos < t.len() + 3 {
                        end += 1;
                    }
                    let before: usize = seg.target.chars().take(pos).map(char::len_utf16).sum();
                    let len: usize = seg.target.chars().skip(pos).take(end - pos).map(char::len_utf16).sum();
                    found.push(TermIo { start: seg.start + before, end: seg.start + before + len, source: source.clone(), target: seg.target.chars().skip(pos).take(end - pos).collect() });
                    break;
                }
            }
        }
    }
    found
}

/// What polishing a translation produced.
pub struct Polished {
    pub targets: Vec<String>,
    pub polished: usize,
    pub kept: usize,
}

/// Polish the sentences of a translation one by one with the model. `on_step(targets, done, total)` runs after every
/// sentence. A sentence the model answers badly keeps its fast translation (counted in `kept`); a model that cannot run
/// (memory, a crashed runtime) or a cancel ends the work with an error.
#[allow(clippy::too_many_arguments)]
pub fn polish_segments(
    state: &AppState,
    llm: &Llm,
    cfg: &Config,
    from: &str,
    to: &str,
    segments: &[SegmentIo],
    tone: Tone,
    cancel: &AtomicBool,
    on_step: &mut dyn FnMut(&[String], usize, usize),
) -> Result<Polished, CmdError> {
    language_gate(state, to)?;
    let tone = if tone_available(to) { tone } else { Tone::Automatic };
    let mut targets: Vec<String> = segments.iter().map(|s| s.target.clone()).collect();
    let (mut polished, mut kept) = (0, 0);
    for (i, seg) in segments.iter().enumerate() {
        if cancel.load(Ordering::Relaxed) {
            return Err(CmdError::new("cancelled", ""));
        }
        // A sentence the user picked from the alternatives stays as it is.
        if seg.pinned || seg.target.trim().is_empty() || from == to {
            continue;
        }
        let terms: Vec<Term> = state.engine.glossary_terms_in(from, to, &seg.source).into_iter().map(|f| Term { source: f.term, found: f.found, target: f.target }).collect();
        let req = tasks::PolishRequest { from, to, source: &seg.source, draft: &seg.target, draft_unclean: seg.unclean, tone, terms: &terms };
        match tasks::polish(llm, cfg, &req, cancel) {
            Ok(better) => {
                if better != targets[i] {
                    targets[i] = better;
                    polished += 1;
                }
            }
            Err(LlmError::Cancelled) => return Err(CmdError::new("cancelled", "")),
            Err(LlmError::Rejected(why)) => {
                kept += 1;
                if trace_enabled() {
                    trace_line(&format!("quality: sentence {i} kept ({why:?})"));
                }
            }
            Err(e) => return Err(llm_error(e)),
        }
        on_step(&targets, i + 1, segments.len());
    }
    Ok(Polished { targets, polished, kept })
}

/// Polish the sentences of a finished translation. After every sentence a `polish-progress` event carries the text so
/// far, so the result updates quietly while the user reads it. A sentence the model fails on keeps its fast translation.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn quality_polish(app: AppHandle, request_id: u64, text: String, from: String, to: String, segments: Vec<SegmentIo>, tone: String) -> CmdResult<PolishOut> {
    let cancel = app.state::<Quality>().next_cancel();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let quality = app.state::<Quality>();
        let cfg = config_for_lang(&state, &to);
        if let Err(why) = usable(&state, &cfg) {
            return Err(CmdError::new("quality_unavailable", why));
        }
        let started = Instant::now();
        let counts = Mutex::new((0usize, 0usize));
        let result = polish_segments(&state, &quality.llm, &cfg, &from, &to, &segments, parse_tone(&tone), &cancel, &mut |targets, done, total| {
            let (new_text, new_segments) = assemble(&text, &segments, targets);
            let terms = locate_terms(&state, &from, &to, &new_segments);
            let changed = targets.iter().zip(&segments).filter(|(t, s)| **t != s.target).count();
            *counts.lock().unwrap() = (changed, done);
            let _ = app.emit("polish-progress", PolishProgress { request_id, out: PolishOut { text: new_text, segments: new_segments, glossary_terms: terms, polished: changed, kept: 0 }, done, total });
            if trace_enabled() {
                trace_line(&format!("quality: #{request_id} sentence {done}/{total} at {} ms", started.elapsed().as_millis()));
            }
        })?;
        let (new_text, new_segments) = assemble(&text, &segments, &result.targets);
        let terms = locate_terms(&state, &from, &to, &new_segments);
        Ok(PolishOut { text: new_text, segments: new_segments, glossary_terms: terms, polished: result.polished, kept: result.kept })
    })
    .await
    .map_err(|e| CmdError::new("engine", e))?
}

/// Documents: should the translated segments be polished? Only when the option is on and Quality mode is usable.
pub fn documents_polish_tone(app: &AppHandle) -> Option<Tone> {
    let state = app.state::<AppState>();
    let s = state.settings.lock().unwrap().clone();
    if !s.files_polish || s.quality_mode == "off" {
        return None;
    }
    usable(&state, &config(&state)).ok().map(|_| parse_tone(&s.tone))
}

/// Polish one translated document segment (a text unit): the sentences the engine made are rewritten one by one and
/// put back between the same gaps. `Ok(None)` when nothing changed.
pub fn polish_translation(app: &AppHandle, from: &str, to: &str, text: &str, segments: &[SegmentIo], tone: Tone, cancel: &AtomicBool) -> Result<String, CmdError> {
    let state = app.state::<AppState>();
    let quality = app.state::<Quality>();
    let cfg = config_for_lang(&state, to);
    let whole;
    let segments = if segments.is_empty() {
        whole = [SegmentIo { source: text.to_string(), input: text.to_string(), target: text.to_string(), start: 0, end: text.encode_utf16().count(), pinned: false, unclean: false }];
        &whole[..]
    } else {
        segments
    };
    let result = polish_segments(&state, &quality.llm, &cfg, from, to, segments, tone, cancel, &mut |_, _, _| {})?;
    Ok(assemble(text, segments, &result.targets).0)
}

/// Live captions in Calm speed: polish one caption line when the model is already loaded and answers within the budget.
/// The captions never wait for a load (it starts in the background for the next line), and a late answer is dropped, so
/// latency stays the fast translation's plus at most `LIVE_BUDGET`.
pub fn live_polish(app: &AppHandle, from: &str, to: &str, source: &str, draft: &str) -> Option<String> {
    const LIVE_BUDGET: Duration = Duration::from_millis(2500);
    let state = app.state::<AppState>();
    let s = state.settings.lock().unwrap().clone();
    if !s.live_polish || s.live_speed != "calm" || s.quality_mode == "off" || from == to {
        return None;
    }
    let cfg = config_for_lang(&state, to);
    usable(&state, &cfg).ok()?;
    language_gate(&state, to).ok()?;
    let quality = app.state::<Quality>();
    if !quality.llm.is_loaded() {
        // Load for the next line without holding up this one.
        let app = app.clone();
        std::thread::spawn(move || {
            let q = app.state::<Quality>();
            let cfg = config(&app.state::<AppState>());
            let _ = q.llm.complete(&cfg, &dawn_llm::Prompt { user: "Reply with OK.".into(), max_tokens: 4 }, &AtomicBool::new(false));
        });
        return None;
    }
    let cancel = Arc::new(AtomicBool::new(false));
    let watchdog = cancel.clone();
    let done = Arc::new(AtomicBool::new(false));
    let finished = done.clone();
    std::thread::spawn(move || {
        let t0 = Instant::now();
        while t0.elapsed() < LIVE_BUDGET && !finished.load(Ordering::Relaxed) {
            std::thread::sleep(Duration::from_millis(50));
        }
        watchdog.store(true, Ordering::Relaxed);
    });
    let terms: Vec<Term> = state.engine.glossary_terms_in(from, to, source).into_iter().map(|f| Term { source: f.term, found: f.found, target: f.target }).collect();
    let tone = if tone_available(to) { parse_tone(&s.tone) } else { Tone::Automatic };
    let req = tasks::PolishRequest { from, to, source, draft, draft_unclean: false, tone, terms: &terms };
    let out = tasks::polish(&quality.llm, &cfg, &req, &cancel).ok();
    done.store(true, Ordering::Relaxed);
    out
}

/// Meeting captions: polish a finished utterance (all its sentences) in the background, when the model is loaded and
/// answers within the budget. The fast translation was shown while the speaker spoke; this replaces it quietly.
pub fn live_polish_utterance(app: &AppHandle, from: &str, to: &str, text: &str, segments: &[SegmentIo]) -> Option<String> {
    const BUDGET: Duration = Duration::from_secs(8);
    let state = app.state::<AppState>();
    let s = state.settings.lock().unwrap().clone();
    if !s.live_polish || s.quality_mode == "off" || from == to {
        return None;
    }
    let cfg = config_for_lang(&state, to);
    usable(&state, &cfg).ok()?;
    language_gate(&state, to).ok()?;
    let quality = app.state::<Quality>();
    if !quality.llm.is_loaded() {
        // Load for the next utterance; this one keeps its fast translation.
        let app = app.clone();
        std::thread::spawn(move || {
            let q = app.state::<Quality>();
            let cfg = config(&app.state::<AppState>());
            let _ = q.llm.complete(&cfg, &dawn_llm::Prompt { user: "Reply with OK.".into(), max_tokens: 4 }, &AtomicBool::new(false));
        });
        return None;
    }
    let cancel = Arc::new(AtomicBool::new(false));
    let (watchdog, done) = (cancel.clone(), Arc::new(AtomicBool::new(false)));
    let finished = done.clone();
    std::thread::spawn(move || {
        let t0 = Instant::now();
        while t0.elapsed() < BUDGET && !finished.load(Ordering::Relaxed) {
            std::thread::sleep(Duration::from_millis(50));
        }
        watchdog.store(true, Ordering::Relaxed);
    });
    let tone = if tone_available(to) { parse_tone(&s.tone) } else { Tone::Automatic };
    let out = polish_translation(app, from, to, text, segments, tone, &cancel).ok();
    done.store(true, Ordering::Relaxed);
    out.filter(|polished| polished != text)
}

/// The editor: polish the text of one segment (`current` is what the segment shows now, `source` is the original text).
#[tauri::command]
pub async fn quality_polish_text(app: AppHandle, source: String, current: String, from: String, to: String, tone: String) -> CmdResult<String> {
    let cancel = app.state::<Quality>().next_cancel();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let cfg = config_for_lang(&state, &to);
        if let Err(why) = usable(&state, &cfg) {
            return Err(CmdError::new("quality_unavailable", why));
        }
        language_gate(&state, &to)?;
        let terms: Vec<Term> = state.engine.glossary_terms_in(&from, &to, &source).into_iter().map(|f| Term { source: f.term, found: f.found, target: f.target }).collect();
        let tone = if tone_available(&to) { parse_tone(&tone) } else { Tone::Automatic };
        let req = tasks::PolishRequest { from: &from, to: &to, source: &source, draft: &current, draft_unclean: false, tone, terms: &terms };
        match tasks::polish(&app.state::<Quality>().llm, &cfg, &req, &cancel) {
            Ok(better) => Ok(better),
            Err(LlmError::Rejected(_)) => Ok(current),
            Err(e) => Err(llm_error(e)),
        }
    })
    .await
    .map_err(|e| CmdError::new("engine", e))?
}

#[tauri::command]
pub fn quality_polish_cancel(quality: State<'_, Quality>) {
    quality.next_cancel();
}

// --- write -------------------------------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteOut {
    pieces: Vec<dawn_llm::diff::Piece>,
    /// The rewrite as a whole.
    text: String,
    /// The model that made it ("Phi-4 mini"), shown in the result footer.
    model: String,
}

/// The Write tab: rewrite `text` in its own language and return the changes word by word.
#[tauri::command]
pub async fn quality_write(app: AppHandle, kind: WriteKind, lang: String, text: String) -> CmdResult<WriteOut> {
    let cancel = app.state::<Quality>().next_cancel();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        // The writing model when it is installed (and good in this language), else the translation model.
        let cfg = write_config(&state, &lang);
        if let Err(why) = usable(&state, &cfg) {
            return Err(CmdError::new("quality_unavailable", why));
        }
        let better = tasks::write(&app.state::<Quality>().llm, &cfg, kind, &lang, &text, &cancel).map_err(llm_error)?;
        let model = match cfg.choice {
            Choice::Ollama => format!("Ollama {}", cfg.ollama_model),
            _ => write_pack(&state, &lang).map(|p| p.name.clone()).unwrap_or_default(),
        };
        Ok(WriteOut { pieces: dawn_llm::diff::diff_words(&text, &better), text: better, model })
    })
    .await
    .map_err(|e| CmdError::new("engine", e))?
}

// --- alternatives from the model ---------------------------------------------------

/// Whole-sentence alternatives from the model, in the tone and with the glossary rules of the polished sentence.
/// `None` when Quality mode is off (the translation model's list is used); `Some(vec![])` when it is on but nothing good
/// came back (the list is hidden rather than showing worse sentences than the polished one).
pub fn model_sentence_alternatives(app: &AppHandle, from: &str, to: &str, source: &str, current: &str) -> Option<Vec<String>> {
    let state = app.state::<AppState>();
    let settings = state.settings.lock().unwrap().clone();
    if settings.quality_mode == "off" {
        return None;
    }
    let cfg = config_for_lang(&state, to);
    if usable(&state, &cfg).is_err() || language_gate(&state, to).is_err() {
        return Some(Vec::new());
    }
    let terms: Vec<Term> = state.engine.glossary_terms_in(from, to, source).into_iter().map(|f| Term { source: f.term, found: f.found, target: f.target }).collect();
    let tone = if tone_available(to) { parse_tone(&settings.tone) } else { Tone::Automatic };
    let req = tasks::PolishRequest { from, to, source, draft: current, draft_unclean: false, tone, terms: &terms };
    let quality = app.state::<Quality>();
    let cancel = AtomicBool::new(false);
    Some(tasks::sentence_alternatives(&quality.llm, &cfg, &req, current, 3, &cancel).unwrap_or_default())
}

/// Other words for one position, from the model. `None` when Quality mode is off or fails: the caller then uses the
/// translation model's own alternatives, as before.
pub fn model_alternatives(app: &AppHandle, from: &str, to: &str, source: &str, sentence: &str, word_start: usize, current: &str) -> Option<Vec<crate::commands::AlternativeOut>> {
    let state = app.state::<AppState>();
    let cfg = config_for_lang(&state, to);
    if cfg.choice == Choice::Off || usable(&state, &cfg).is_err() || language_gate(&state, to).is_err() {
        return None;
    }
    let quality = app.state::<Quality>();
    let cancel = AtomicBool::new(false);
    let words = tasks::alternatives(&quality.llm, &cfg, from, to, source, sentence, current, &cancel).ok()?;
    if words.is_empty() {
        return None;
    }
    let units: Vec<u16> = sentence.encode_utf16().collect();
    let end = (word_start + current.encode_utf16().count()).min(units.len());
    let (head, tail) = (String::from_utf16_lossy(&units[..word_start.min(units.len())]), String::from_utf16_lossy(&units[end..]));
    let mut out = vec![crate::commands::AlternativeOut { word: current.to_string(), text: sentence.to_string(), preview: String::new(), current: true }];
    out.extend(words.into_iter().map(|w| crate::commands::AlternativeOut { text: format!("{head}{w}{tail}"), preview: String::new(), word: w, current: false }));
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seg(source: &str, target: &str, start: usize, end: usize) -> SegmentIo {
        SegmentIo { source: source.into(), input: source.into(), target: target.into(), start, end, pinned: false, unclean: false }
    }

    #[test]
    fn a_polished_sentence_is_put_back_between_the_same_gaps() {
        let text = "Hallo Welt.  Wie geht es?\n\nGut.";
        let u = |s: &str| s.encode_utf16().count();
        let segs = vec![seg("a", "Hallo Welt.", 0, u("Hallo Welt.")), seg("b", "Wie geht es?", 13, 13 + u("Wie geht es?")), seg("c", "Gut.", 27, 27 + u("Gut."))];
        let (out, new) = assemble(text, &segs, &["Hallo Welt.".into(), "Wie geht's?".into(), "Gut.".into()]);
        assert_eq!(out, "Hallo Welt.  Wie geht's?\n\nGut.");
        assert_eq!(new[1].start, 13);
        assert_eq!(new[1].end, 13 + u("Wie geht's?"));
        assert_eq!(new[2].start, new[1].end + 2, "the gap after the second sentence is kept");
        assert_eq!(&out.encode_utf16().collect::<Vec<_>>()[new[2].start..new[2].end], "Gut.".encode_utf16().collect::<Vec<_>>().as_slice());
    }

    #[test]
    fn positions_are_utf16_units_not_bytes() {
        let text = "日本語。次。";
        let segs = vec![seg("a", "日本語。", 0, 4), seg("b", "次。", 4, 6)];
        let (out, new) = assemble(text, &segs, &["日本語。".into(), "次の文。".into()]);
        assert_eq!(out, "日本語。次の文。");
        assert_eq!((new[1].start, new[1].end), (4, 8));
        // Characters outside the BMP count twice in UTF-16.
        let (out, new) = assemble("😀 A. B.", &[seg("a", "A.", 3, 5), seg("b", "B.", 6, 8)], &["A!".into(), "Bee.".into()]);
        assert_eq!(out, "😀 A! Bee.");
        assert_eq!((new[0].start, new[1].start), (3, 6));
    }

    fn cands(recommended: bool, alternative: bool, writing: bool) -> Vec<Candidate<'static>> {
        vec![
            Candidate { id: "hy", tier: "recommended", installed: recommended, covers: true },
            Candidate { id: "index", tier: "alternative", installed: alternative, covers: true },
            Candidate { id: "phi", tier: "writing", installed: writing, covers: true },
        ]
    }

    #[test]
    fn with_no_model_installed_there_is_nothing_to_use() {
        let c = cands(false, false, false);
        assert_eq!((choose_model(&c, "hy"), choose_writer(&c)), (None, None));
    }

    #[test]
    fn only_the_recommended_model_installed_is_used_for_everything() {
        let c = cands(true, false, false);
        assert_eq!((choose_model(&c, "hy"), choose_model(&c, "phi"), choose_writer(&c)), (Some("hy"), Some("hy"), Some("hy")));
    }

    #[test]
    fn only_the_writing_model_installed_counts_as_set_up_and_is_used_when_the_chosen_one_is_gone() {
        // The reported case: Hy-MT2 removed, only Phi-4 mini installed, the setting still names Hy-MT2.
        let c = cands(false, false, true);
        assert_eq!(choose_model(&c, "hy"), Some("phi"), "an installed model is used automatically");
        assert_eq!(choose_model(&c, ""), Some("phi"));
        assert_eq!(choose_writer(&c), Some("phi"), "the Write tab is ready");
    }

    #[test]
    fn with_both_installed_the_chosen_one_wins_polish_and_the_writing_model_wins_write() {
        let c = cands(true, false, true);
        assert_eq!(choose_model(&c, ""), Some("hy"), "recommended first");
        assert_eq!(choose_model(&c, "phi"), Some("phi"), "Phi-4 mini can be chosen for polishing");
        assert_eq!(choose_writer(&c), Some("phi"));
        // The preference order without a choice: recommended, alternative, writing.
        assert_eq!(choose_model(&cands(false, true, true), ""), Some("index"));
    }

    #[test]
    fn a_model_that_does_not_cover_the_language_is_skipped_and_nothing_is_left_for_arabic_with_only_phi() {
        let mut c = cands(true, false, true);
        c[0].covers = false; // pretend the recommended model lacks the language
        assert_eq!(choose_model(&c, ""), Some("phi"));
        let only_phi = vec![Candidate { id: "phi", tier: "writing", installed: true, covers: false }];
        assert_eq!(choose_model(&only_phi, "phi"), None, "Arabic, Turkish, Urdu, Hindi: the fast translation only");
        assert_eq!(choose_writer(&only_phi), None);
    }

    #[test]
    fn the_status_names_only_what_is_missing() {
        let base = StateInput { builtin: true, ..Default::default() };
        assert_eq!(status_state(StateInput::default()), ("off", ""));
        assert_eq!(status_state(base), ("not_set_up", "model"));
        // The engine is installed, the model is not: only the model is asked for.
        assert_eq!(status_state(StateInput { runtime_installed: true, ..base }), ("not_set_up", "model"));
        assert_eq!(status_state(StateInput { model_installed: true, ..base }), ("not_set_up", "engine"));
        assert_eq!(status_state(StateInput { downloading: true, runtime_installed: true, ..base }), ("downloading", ""));
        let set_up = StateInput { model_installed: true, runtime_installed: true, ..base };
        assert_eq!(status_state(set_up), ("ready", ""));
        assert_eq!(status_state(StateInput { loading: true, ..set_up }), ("loading", ""));
        assert_eq!(status_state(StateInput { loaded: true, ..set_up }), ("loaded", ""));
        // Unloaded after the idle time is "ready" again, not an error.
        assert_eq!(status_state(StateInput { loaded: false, loading: false, ..set_up }), ("ready", ""));
    }

    #[test]
    fn the_status_of_ollama_says_what_is_wrong() {
        let base = StateInput { ollama: true, ..Default::default() };
        assert_eq!(status_state(base), ("unavailable", "ollama"));
        assert_eq!(status_state(StateInput { ollama_running: true, ..base }), ("unavailable", "ollama_models"));
        assert_eq!(status_state(StateInput { ollama_running: true, ollama_has_models: true, ..base }), ("not_set_up", "ollama_model"));
        assert_eq!(status_state(StateInput { ollama_running: true, ollama_has_models: true, ollama_model_chosen: true, ..base }), ("ready", ""));
    }

    fn pack(id: &str, kind: &str) -> LlmPack {
        LlmPack {
            id: id.into(),
            kind: kind.into(),
            name: id.into(),
            tier: String::new(),
            file: "f".into(),
            urls: vec![],
            size_bytes: 1,
            sha256: String::new(),
            license: "MIT".into(),
            attribution: String::new(),
            source_url: String::new(),
            ram_bytes: 0,
            description: String::new(),
            details: String::new(),
            languages: vec![],
        }
    }

    #[test]
    fn one_click_downloads_the_engine_with_the_first_model_only() {
        let (runtime, model) = (pack("rt", "llm-runtime"), pack("m", "llm"));
        let ids = |plan: Vec<LlmPack>| plan.into_iter().map(|p| p.id).collect::<Vec<_>>();
        assert_eq!(ids(install_plan(Some(&runtime), false, &model)), ["rt", "m"], "the engine first");
        assert_eq!(ids(install_plan(Some(&runtime), true, &model)), ["m"], "an installed engine is not downloaded again");
        assert_eq!(ids(install_plan(Some(&runtime), false, &runtime)), ["rt"]);
        assert_eq!(ids(install_plan(None, false, &model)), ["m"]);
    }

    #[test]
    fn the_download_speed_is_smoothed_and_starts_at_zero() {
        let mut m = SpeedMeter::default();
        assert_eq!(m.update(0, 0), 0);
        assert_eq!(m.update(100, 100_000), 0, "too early for a number");
        assert_eq!(m.update(1000, 1_000_000), 1_000_000);
        let after = m.update(2000, 1_500_000);
        assert!(after < 1_000_000 && after > 500_000, "{after}");
    }

    #[test]
    fn tone_names_from_the_settings_are_understood() {
        assert_eq!(parse_tone("formal"), Tone::Formal);
        assert_eq!(parse_tone("informal"), Tone::Informal);
        assert_eq!(parse_tone("automatic"), Tone::Automatic);
        assert_eq!(parse_tone("nonsense"), Tone::Automatic);
    }

    #[test]
    fn modes_map_to_backends() {
        assert_eq!(choice_of("off"), Choice::Off);
        assert_eq!(choice_of("builtin"), Choice::Builtin);
        assert_eq!(choice_of("ollama"), Choice::Ollama);
        assert_eq!(choice_of(""), Choice::Off);
    }
}
