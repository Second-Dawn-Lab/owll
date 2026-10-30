//! Document translation jobs: Word, PowerPoint, Excel, text, Markdown and PDF files.
//!
//! The work is done by the `dawn-docs` crate; this module runs a job on its own thread, reports
//! progress to the window, keeps one job at a time cancellable and adds a history entry when a
//! document is done. Documents never leave the computer: they are read from and written to local
//! files only.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use dawn_docs::{DocError, Kind, Progress, Report, Translator};
use dawn_translate::{Ct2Engine, TranslateError, TranslateOptions};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::commands::{AppState, CmdError, CmdResult};

/// The running job's cancel flag (one at a time).
#[derive(Default)]
pub struct DocJob(Mutex<Option<Arc<AtomicBool>>>);

/// Runs document texts through the engine. The first engine error is kept so the window can offer
/// "download the language pack" instead of a bare failure.
struct EngineTranslator {
    engine: Arc<Ct2Engine>,
    from: String,
    to: String,
    cancel: Arc<AtomicBool>,
    error: Option<TranslateError>,
}

impl Translator for EngineTranslator {
    fn translate(&mut self, texts: &[String]) -> Result<Vec<String>, DocError> {
        let options = TranslateOptions { batch_size: 16, fast_beam: None, beam: 2 };
        let mut out = Vec::with_capacity(texts.len());
        for text in texts {
            match self.engine.translate_streaming(text, &self.from, &self.to, &self.cancel, &options, &mut |_| {}) {
                Ok(t) => out.push(t.text),
                Err(TranslateError::Cancelled) => return Err(DocError::Cancelled),
                Err(err) => {
                    let message = err.to_string();
                    self.error = Some(err);
                    return Err(DocError::Translate(message));
                }
            }
        }
        Ok(out)
    }

    fn is_cancelled(&self) -> bool {
        self.cancel.load(Ordering::Relaxed)
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocInfo {
    path: String,
    name: String,
    /// "docx", "pptx", "xlsx", "txt", "markdown" or "pdf".
    kind: &'static str,
    size_bytes: u64,
    /// "ok", "unsure" or "none" (no text found).
    detection: &'static str,
    detected: Option<String>,
    /// The file is larger than the limit.
    too_large: bool,
}

fn kind_name(kind: Kind) -> &'static str {
    match kind {
        Kind::Docx => "docx",
        Kind::Pptx => "pptx",
        Kind::Xlsx => "xlsx",
        Kind::Txt => "txt",
        Kind::Markdown => "markdown",
        Kind::Pdf => "pdf",
    }
}

fn doc_error(err: DocError) -> CmdError {
    CmdError::new(err.code(), err)
}

/// What a dropped or chosen file is, and which language its text is in. Runs off the UI thread.
#[tauri::command]
pub async fn doc_inspect(state: State<'_, AppState>, path: String) -> CmdResult<DocInfo> {
    let active = state.engine.installed_languages();
    let hint = state.settings.lock().unwrap().source_language.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let file = PathBuf::from(&path);
        let kind = Kind::from_path(&file).ok_or_else(|| CmdError::new("unsupported", file.extension().map(|e| e.to_string_lossy().into_owned()).unwrap_or_default()))?;
        let size_bytes = std::fs::metadata(&file)?.len();
        let name = file.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let too_large = size_bytes > dawn_docs::MAX_FILE_BYTES;
        let mut info = DocInfo { path, name, kind: kind_name(kind), size_bytes, detection: "none", detected: None, too_large };
        if too_large {
            return Ok(info);
        }
        // Reading the sample also finds encrypted, damaged and scanned files before any translation starts.
        let sample = dawn_docs::sample_text(&file, 2000).map_err(doc_error)?;
        let found = dawn_translate::detect_in_context(&sample, &active, (hint != "auto").then_some(hint.as_str()));
        match found {
            dawn_translate::Detection::Language(code) => {
                info.detection = "ok";
                info.detected = Some(code);
            }
            dawn_translate::Detection::Unsure => info.detection = "unsure",
            dawn_translate::Detection::NoText => info.detection = "none",
        }
        Ok(info)
    })
    .await
    .map_err(|e| CmdError::new("engine", e))?
}

/// Where the translated file goes by default: `name (DE).ext`, in the download folder when one is set.
#[tauri::command]
pub fn doc_default_output(state: State<'_, AppState>, path: String, to: String) -> String {
    let setting = state.settings.lock().unwrap().download_location.clone();
    let dir = (setting != "ask" && !setting.is_empty()).then(|| PathBuf::from(setting));
    dawn_docs::default_output_path(Path::new(&path), &to, dir.as_deref()).to_string_lossy().into_owned()
}

#[derive(Serialize, Clone)]
struct DocProgress {
    done: usize,
    total: usize,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DocDone {
    output: String,
    kind: &'static str,
    units: usize,
    translated: usize,
    parts: Option<(usize, &'static str)>,
    skipped: Vec<String>,
}

#[derive(Serialize, Clone)]
struct DocFailed {
    code: String,
    message: String,
}

fn failure(error: &Option<TranslateError>, err: DocError, catalog: &dawn_models::Catalog) -> DocFailed {
    if let Some(engine_error) = error {
        return match engine_error {
            // The message is the language code the user needs to download.
            TranslateError::ModelMissing(lang) => DocFailed { code: "pack_missing".into(), message: lang.clone() },
            TranslateError::ModelLoad { model, .. } => DocFailed { code: "model_load".into(), message: catalog.language_for_model(model).map(|l| l.code.clone()).unwrap_or_default() },
            other => DocFailed { code: "engine".into(), message: other.to_string() },
        };
    }
    DocFailed { code: err.code().into(), message: err.to_string() }
}

/// Start translating `path` into `output`. Progress, the result and failures arrive as events
/// (`doc-progress`, `doc-done`, `doc-failed`); only one document runs at a time.
#[tauri::command]
pub fn doc_translate(app: AppHandle, state: State<'_, AppState>, job: State<'_, DocJob>, path: String, from: String, to: String, output: String) -> CmdResult<()> {
    if from == "auto" {
        return Err(CmdError::new("bad_request", "source language must be resolved first"));
    }
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut slot = job.0.lock().unwrap();
        if slot.is_some() {
            return Err(CmdError::new("busy", "a document is already being translated"));
        }
        *slot = Some(cancel.clone());
    }
    let engine = state.engine.clone();
    let catalog = state.catalog.clone();
    std::thread::spawn(move || {
        let mut translator = EngineTranslator { engine, from: from.clone(), to: to.clone(), cancel, error: None };
        let progress_app = app.clone();
        let result = dawn_docs::translate_document(Path::new(&path), Path::new(&output), &mut translator, &mut |p: Progress| {
            let _ = progress_app.emit("doc-progress", DocProgress { done: p.done, total: p.total });
        });
        match result {
            Ok(report) => {
                add_history(&app, &from, &to, &path, &output);
                let _ = app.emit("doc-done", done_payload(&output, report));
            }
            Err(err) => {
                let _ = app.emit("doc-failed", failure(&translator.error, err, &catalog));
            }
        }
        *app.state::<DocJob>().0.lock().unwrap() = None;
    });
    Ok(())
}

fn done_payload(output: &str, report: Report) -> DocDone {
    DocDone { output: output.to_string(), kind: kind_name(report.kind), units: report.units, translated: report.translated, parts: report.parts, skipped: report.skipped }
}

/// One history entry per document: its name and the name of the result, never its text.
fn add_history(app: &AppHandle, from: &str, to: &str, input: &str, output: &str) {
    let name = |p: &str| Path::new(p).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let state = app.state::<AppState>();
    if !state.settings.lock().unwrap().keep_history {
        return;
    }
    if state.history.lock().unwrap().add(from.to_string(), to.to_string(), name(input), name(output)).is_ok() {
        let _ = app.emit("history-changed", ());
    }
}

#[tauri::command]
pub fn doc_cancel(job: State<'_, DocJob>) {
    if let Some(cancel) = job.0.lock().unwrap().as_ref() {
        cancel.store(true, Ordering::Relaxed);
    }
}

/// Open a file (the translated document) with the program Windows associates with it.
#[tauri::command]
pub fn doc_open(path: String) -> CmdResult<()> {
    #[cfg(windows)]
    {
        std::process::Command::new("cmd").args(["/C", "start", "", &path]).spawn()?;
    }
    #[cfg(not(windows))]
    {
        let _ = path;
    }
    Ok(())
}

/// Show a file in its folder, selected.
#[tauri::command]
pub fn doc_show_in_folder(path: String) -> CmdResult<()> {
    #[cfg(windows)]
    {
        std::process::Command::new("explorer").arg(format!("/select,{path}")).spawn()?;
    }
    #[cfg(not(windows))]
    {
        let _ = path;
    }
    Ok(())
}

/// The bytes of a dropped image file, for the Images tab (Tauri hands over the path of a dropped file).
#[tauri::command]
pub fn read_dropped_file(path: String) -> CmdResult<tauri::ipc::Response> {
    const MAX: u64 = 50_000_000;
    let size = std::fs::metadata(&path)?.len();
    if size > MAX {
        return Err(CmdError::new("too_large", "the file is too large"));
    }
    Ok(tauri::ipc::Response::new(std::fs::read(&path)?))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kinds_have_stable_names() {
        assert_eq!(kind_name(Kind::Markdown), "markdown");
        assert_eq!(kind_name(Kind::Pdf), "pdf");
    }

    #[test]
    fn an_engine_error_wins_over_the_generic_failure() {
        let catalog = dawn_models::Catalog::default();
        let failed = failure(&Some(TranslateError::ModelMissing("de".into())), DocError::Translate("x".into()), &catalog);
        assert_eq!((failed.code.as_str(), failed.message.as_str()), ("pack_missing", "de"));
        let plain = failure(&None, DocError::Scanned, &catalog);
        assert_eq!(plain.code, "scanned");
    }
}
