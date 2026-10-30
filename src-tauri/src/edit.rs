//! Translate and edit: a document is translated, opened in an editor, and written only when the user saves.
//!
//! The reading, the places of the segments and the write-back are `dawn-docs`' [`Session`]; this module keeps the one open
//! document, runs the translation on its own thread, answers per-segment requests (analysis for word alternatives,
//! retranslation) and keeps drafts. A draft holds the translations and the user's edits as text, never a copy of the file,
//! and lives in Owl-L's data folder. Documents and drafts never leave the computer.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use dawn_docs::{Fingerprint, FingerprintStatus, Progress, Session};
use dawn_translate::TranslateOptions;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::commands::{AppState, CmdError, CmdResult, TranslateOut};
use crate::docs::{self, DocJob, EngineTranslator};

/// The open document.
struct EditDoc {
    session: Arc<Session>,
    from: String,
    to: String,
    /// The translation of every unit as the engine made it (addresses written out), the base of the user's edits.
    base: Vec<String>,
    /// Glossary terms put in, per unit.
    hits: Vec<usize>,
}

#[derive(Default)]
pub struct EditSlot(Mutex<Option<EditDoc>>);

#[derive(Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct FingerprintJson {
    size: u64,
    modified: u64,
    text_hash: u64,
}

impl From<&Fingerprint> for FingerprintJson {
    fn from(f: &Fingerprint) -> Self {
        Self { size: f.size, modified: f.modified, text_hash: f.text_hash }
    }
}

impl From<&FingerprintJson> for Fingerprint {
    fn from(f: &FingerprintJson) -> Self {
        Fingerprint { size: f.size, modified: f.modified, text_hash: f.text_hash }
    }
}

/// What is kept of an unfinished edit. No part of the file itself: the segments' translations and the edits.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Draft {
    id: String,
    path: String,
    name: String,
    kind: String,
    from: String,
    to: String,
    fingerprint: FingerprintJson,
    base: Vec<String>,
    hits: Vec<usize>,
    edits: BTreeMap<usize, String>,
    updated_at: u64,
    /// Translated but not edited yet: not listed as a draft, and removed after a few days.
    #[serde(default)]
    pending: bool,
}

/// An unedited translation is kept this long so the Edit button still works the next day.
const PENDING_DAYS: u64 = 3;

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn drafts_dir() -> PathBuf {
    dawn_core::app_dir("owll").join("drafts")
}

/// One draft per document path.
fn draft_id(path: &str) -> String {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in path.to_lowercase().replace('\\', "/").bytes() {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}")
}

fn draft_path(id: &str) -> PathBuf {
    drafts_dir().join(format!("{id}.json"))
}

fn read_draft(id: &str) -> Option<Draft> {
    // The id comes from the window: only the hex form this module writes is a valid file name.
    if id.len() != 16 || !id.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    serde_json::from_slice(&std::fs::read(draft_path(id)).ok()?).ok()
}

fn write_draft(draft: &Draft) -> std::io::Result<()> {
    std::fs::create_dir_all(drafts_dir())?;
    let target = draft_path(&draft.id);
    let temp = target.with_extension("json.part");
    std::fs::write(&temp, serde_json::to_vec(draft)?)?;
    if target.exists() {
        std::fs::remove_file(&target)?;
    }
    std::fs::rename(temp, target)
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HeaderOut {
    part: &'static str,
    name: Option<String>,
    number: Option<usize>,
    cell: Option<String>,
}

/// One row of the editor.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SegmentOut {
    /// The unit this row translates, or none for text that is left as it was.
    unit: Option<usize>,
    header: HeaderOut,
    source: String,
    /// Formatting of the marked stretches: 1 bold, 2 italic, 4 underline, 8 link.
    styles: Vec<u8>,
    /// No markers or address tokens: word alternatives work in the translation.
    plain: bool,
    /// The text now: the user's edit, else the engine's translation.
    translation: Option<String>,
    /// The engine's translation, sent only for an edited segment (otherwise it is `translation`).
    base: Option<String>,
    hits: usize,
    edited: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EditOpened {
    path: String,
    name: String,
    kind: &'static str,
    from: String,
    to: String,
    segments: Vec<SegmentOut>,
    units: usize,
    skipped: Vec<String>,
    resumed: bool,
}

fn style_bits(style: dawn_docs::SpanStyle) -> u8 {
    u8::from(style.bold) | (u8::from(style.italic) << 1) | (u8::from(style.underline) << 2) | (u8::from(style.link) << 3)
}

fn opened_payload(path: &str, doc: &EditDoc, edits: &BTreeMap<usize, String>, resumed: bool) -> EditOpened {
    let session = &doc.session;
    let segments = session
        .segments
        .iter()
        .map(|s| SegmentOut {
            unit: s.unit,
            header: HeaderOut { part: s.header.part, name: s.header.name.clone(), number: s.header.number, cell: s.header.cell.clone() },
            source: s.source.clone(),
            styles: s.styles.iter().copied().map(style_bits).collect(),
            plain: s.plain,
            translation: s.unit.map(|u| edits.get(&u).cloned().unwrap_or_else(|| doc.base[u].clone())),
            base: s.unit.filter(|u| edits.contains_key(u)).map(|u| doc.base[u].clone()),
            hits: s.unit.map_or(0, |u| doc.hits[u]),
            edited: s.unit.is_some_and(|u| edits.contains_key(&u)),
        })
        .collect();
    EditOpened {
        path: path.to_string(),
        name: Path::new(path).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
        kind: docs::kind_name(session.kind),
        from: doc.from.clone(),
        to: doc.to.clone(),
        segments,
        units: session.units.len(),
        skipped: session.skipped.clone(),
        resumed,
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct EditTranslated {
    draft_id: String,
    path: String,
    kind: &'static str,
    units: usize,
    skipped: Vec<String>,
}

/// Translate a document for editing: nothing is written to the output; the translations are kept as a draft
/// (`edit-translated`), and the editor opens it with `edit_resume`. Progress and failures use the same events as a
/// plain translation (`doc-progress`, `doc-failed`); one job at a time, cancellable with `doc_cancel`.
#[tauri::command]
pub fn edit_start(app: AppHandle, state: State<'_, AppState>, job: State<'_, DocJob>, path: String, from: String, to: String) -> CmdResult<()> {
    if from == "auto" {
        return Err(CmdError::new("bad_request", "source language must be resolved first"));
    }
    let cancel = Arc::new(AtomicBool::new(false));
    job.begin(cancel.clone())?;
    let engine = state.engine.clone();
    let catalog = state.catalog.clone();
    std::thread::spawn(move || {
        let run = || -> Result<(), (Option<dawn_translate::TranslateError>, dawn_docs::DocError)> {
            let session = Session::open(Path::new(&path)).map_err(|e| (None, e))?;
            let mut translator = EngineTranslator::new(engine, from.clone(), to.clone(), cancel);
            let progress_app = app.clone();
            let translated = session
                .translate(&mut translator, &mut |p: Progress| {
                    let _ = progress_app.emit("doc-progress", docs::DocProgress { done: p.done, total: p.total });
                })
                .map_err(|e| (translator.take_error(), e))?;
            let base: Vec<String> = translated.iter().enumerate().map(|(i, t)| session.display(i, t)).collect();
            let hits: Vec<usize> = session.units.iter().map(|u| translator.hits_for(u)).collect();
            let draft = Draft {
                id: draft_id(&path),
                name: Path::new(&path).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
                kind: docs::kind_name(session.kind).to_string(),
                path: path.clone(),
                from,
                to,
                fingerprint: (&session.fingerprint).into(),
                base,
                hits,
                edits: BTreeMap::new(),
                updated_at: now_ms(),
                pending: true,
            };
            write_draft(&draft).map_err(|e| (None, dawn_docs::DocError::Io(e)))?;
            let _ = app.emit("edit-translated", EditTranslated { draft_id: draft.id.clone(), path, kind: docs::kind_name(session.kind), units: session.units.len(), skipped: session.skipped.clone() });
            Ok(())
        };
        if let Err((engine_error, err)) = run() {
            let _ = app.emit("doc-failed", docs::failure(&engine_error, err, &catalog));
        }
        app.state::<DocJob>().end();
    });
    Ok(())
}

/// Continue a draft. `path` is the document when it was moved; without it the path stored in the draft is used.
/// Answers `draft_missing` (the file is not there) or `draft_changed` (its text is not what the draft was made from)
/// so the window can ask the user to pick the file again or discard the draft.
#[tauri::command]
pub async fn edit_resume(app: AppHandle, edit: State<'_, EditSlot>, id: String, path: Option<String>) -> CmdResult<EditOpened> {
    let draft = read_draft(&id).ok_or_else(|| CmdError::new("draft_gone", "the draft no longer exists"))?;
    let file = path.filter(|p| !p.is_empty()).unwrap_or_else(|| draft.path.clone());
    let fingerprint: Fingerprint = (&draft.fingerprint).into();
    let (opened, session) = tauri::async_runtime::spawn_blocking({
        let (file, from, to) = (file.clone(), draft.from.clone(), draft.to.clone());
        move || -> CmdResult<(Draft, Session)> {
            match fingerprint.check(Path::new(&file)) {
                FingerprintStatus::Missing => return Err(CmdError::new("draft_missing", file)),
                FingerprintStatus::Changed => return Err(CmdError::new("draft_changed", file)),
                FingerprintStatus::Same => {}
            }
            let session = Session::open(Path::new(&file)).map_err(|e| CmdError::new(e.code(), e))?;
            let _ = (from, to);
            Ok((read_draft(&id).ok_or_else(|| CmdError::new("draft_gone", "the draft no longer exists"))?, session))
        }
    })
    .await
    .map_err(|e| CmdError::new("engine", e))??;
    let draft = opened;
    if draft.base.len() != session.units.len() {
        return Err(CmdError::new("draft_changed", file));
    }
    let doc = EditDoc { session: Arc::new(session), from: draft.from.clone(), to: draft.to.clone(), base: draft.base.clone(), hits: draft.hits.clone() };
    let payload = opened_payload(&file, &doc, &draft.edits, true);
    *edit.0.lock().unwrap() = Some(doc);
    let _ = app;
    Ok(payload)
}

/// Keep the user's edits so far (called a moment after each change).
#[tauri::command]
pub fn edit_draft_save(edit: State<'_, EditSlot>, path: String, edits: BTreeMap<usize, String>) -> CmdResult<()> {
    let slot = edit.0.lock().unwrap();
    let doc = slot.as_ref().ok_or_else(|| CmdError::new("no_document", "no document is open"))?;
    let draft = Draft {
        id: draft_id(&path),
        name: Path::new(&path).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
        kind: docs::kind_name(doc.session.kind).to_string(),
        path,
        from: doc.from.clone(),
        to: doc.to.clone(),
        fingerprint: (&doc.session.fingerprint).into(),
        base: doc.base.clone(),
        hits: doc.hits.clone(),
        pending: edits.is_empty(),
        edits,
        updated_at: now_ms(),
    };
    write_draft(&draft)?;
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftInfo {
    id: String,
    name: String,
    path: String,
    kind: String,
    from: String,
    to: String,
    updated_at: u64,
    edited: usize,
    units: usize,
    /// "ok", "missing" (the file is not there) or "maybe_changed" (size or date differ; checked when it is opened).
    status: &'static str,
}

#[tauri::command]
pub fn drafts_list() -> Vec<DraftInfo> {
    let mut out: Vec<DraftInfo> = Vec::new();
    let Ok(entries) = std::fs::read_dir(drafts_dir()) else { return out };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        let Some(id) = name.strip_suffix(".json") else { continue };
        let Some(draft) = read_draft(id) else { continue };
        if draft.pending {
            if now_ms().saturating_sub(draft.updated_at) > PENDING_DAYS * 86_400_000 {
                let _ = std::fs::remove_file(draft_path(id));
            }
            continue;
        }
        let meta = std::fs::metadata(&draft.path).ok();
        let status = match &meta {
            None => "missing",
            Some(m) if m.len() != draft.fingerprint.size => "maybe_changed",
            Some(_) => "ok",
        };
        out.push(DraftInfo { id: draft.id, name: draft.name, path: draft.path, kind: draft.kind, from: draft.from, to: draft.to, updated_at: draft.updated_at, edited: draft.edits.len(), units: draft.base.len(), status });
    }
    out.sort_by_key(|d| std::cmp::Reverse(d.updated_at));
    out
}

#[tauri::command]
pub fn draft_delete(id: String) -> CmdResult<()> {
    if read_draft(&id).is_some() {
        std::fs::remove_file(draft_path(&id))?;
    }
    Ok(())
}

/// The sentences of the unit's translation, for word and sentence alternatives and the glossary highlight: the source
/// is translated again with the same settings, which is quick (sentences are cached) and gives the same text. `None`
/// when the current translation is not what the engine makes (the user typed in it, or picked another alternative):
/// then only the text itself is clickable.
#[tauri::command]
pub async fn edit_analyse(state: State<'_, AppState>, edit: State<'_, EditSlot>, unit: usize, current: String) -> CmdResult<Option<TranslateOut>> {
    let (text, session, from, to) = {
        let slot = edit.0.lock().unwrap();
        let doc = slot.as_ref().ok_or_else(|| CmdError::new("no_document", "no document is open"))?;
        (doc.session.units.get(unit).cloned().ok_or_else(|| CmdError::new("bad_request", "no such segment"))?, doc.session.clone(), doc.from.clone(), doc.to.clone())
    };
    let engine = state.engine.clone();
    let catalog = state.catalog.clone();
    let translated = tauri::async_runtime::spawn_blocking(move || {
        let cancel = AtomicBool::new(false);
        engine.translate_streaming(&text, &from, &to, &cancel, &TranslateOptions { batch_size: 16, fast_beam: None, beam: 2 }, &mut |_| {})
    })
    .await
    .map_err(|e| CmdError::new("engine", e))?
    .map_err(|e| docs::translate_error_out(&catalog, e))?;
    Ok((session.display(unit, &translated.text) == current).then(|| translated.into()))
}

#[derive(Serialize)]
pub struct Retranslated {
    text: String,
    hits: usize,
}

/// Translate one segment again, ignoring edits (the window asks the user first).
#[tauri::command]
pub async fn edit_retranslate(state: State<'_, AppState>, edit: State<'_, EditSlot>, unit: usize) -> CmdResult<Retranslated> {
    let (text, session, from, to) = {
        let slot = edit.0.lock().unwrap();
        let doc = slot.as_ref().ok_or_else(|| CmdError::new("no_document", "no document is open"))?;
        (doc.session.units.get(unit).cloned().ok_or_else(|| CmdError::new("bad_request", "no such segment"))?, doc.session.clone(), doc.from.clone(), doc.to.clone())
    };
    let engine = state.engine.clone();
    let catalog = state.catalog.clone();
    let t = tauri::async_runtime::spawn_blocking(move || {
        let cancel = AtomicBool::new(false);
        engine.translate_streaming(&text, &from, &to, &cancel, &TranslateOptions { batch_size: 16, fast_beam: None, beam: 2 }, &mut |_| {})
    })
    .await
    .map_err(|e| CmdError::new("engine", e))?
    .map_err(|e| docs::translate_error_out(&catalog, e))?;
    Ok(Retranslated { text: session.display(unit, &t.text), hits: t.glossary_hits })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Saved {
    output: String,
    skipped: Vec<String>,
}

/// Write the document with the user's edits to `output` (never over the original). The draft is removed unless asked to keep it.
#[tauri::command]
pub async fn edit_save(app: AppHandle, edit: State<'_, EditSlot>, path: String, output: String, edits: BTreeMap<usize, String>, keep_draft: bool) -> CmdResult<Saved> {
    let (session, translations, from, to) = {
        let slot = edit.0.lock().unwrap();
        let doc = slot.as_ref().ok_or_else(|| CmdError::new("no_document", "no document is open"))?;
        let translations: Vec<String> = doc.base.iter().enumerate().map(|(i, b)| edits.get(&i).cloned().unwrap_or_else(|| b.clone())).collect();
        (doc.session.clone(), translations, doc.from.clone(), doc.to.clone())
    };
    if Path::new(&output) == Path::new(&path) {
        return Err(CmdError::new("bad_request", "the original is never overwritten"));
    }
    let out = output.clone();
    let report = tauri::async_runtime::spawn_blocking(move || session.save(&translations, Path::new(&out)))
        .await
        .map_err(|e| CmdError::new("engine", e))?
        .map_err(|e| CmdError::new(e.code(), e))?;
    docs::add_history(&app, &from, &to, &path, &output);
    if !keep_draft {
        let _ = std::fs::remove_file(draft_path(&draft_id(&path)));
    }
    Ok(Saved { output, skipped: report.skipped })
}

/// Leave the editor. `delete_draft` removes the draft too (Discard).
#[tauri::command]
pub fn edit_close(edit: State<'_, EditSlot>, path: String, delete_draft: bool) {
    *edit.0.lock().unwrap() = None;
    if delete_draft {
        let _ = std::fs::remove_file(draft_path(&draft_id(&path)));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn draft_ids_are_stable_per_path_and_only_hex_names_are_read() {
        assert_eq!(draft_id(r"C:\Docs\A.docx"), draft_id("c:/docs/a.docx"));
        assert_ne!(draft_id("a.docx"), draft_id("b.docx"));
        assert_eq!(draft_id("x").len(), 16);
        assert!(read_draft("../../etc/passwd").is_none());
        assert!(read_draft("zzzzzzzzzzzzzzzz").is_none());
    }

    #[test]
    fn style_bits_pack_the_four_flags() {
        let s = dawn_docs::SpanStyle { bold: true, italic: false, underline: true, link: true };
        assert_eq!(style_bits(s), 1 | 4 | 8);
    }

    #[test]
    fn a_draft_round_trips_through_json() {
        let draft = Draft {
            id: "0123456789abcdef".into(),
            path: "a.docx".into(),
            name: "a.docx".into(),
            kind: "docx".into(),
            from: "en".into(),
            to: "de".into(),
            fingerprint: FingerprintJson { size: 10, modified: 20, text_hash: 30 },
            base: vec!["Hallo".into()],
            hits: vec![0],
            edits: BTreeMap::from([(0, "Guten Tag".to_string())]),
            updated_at: 5,
            pending: false,
        };
        let back: Draft = serde_json::from_slice(&serde_json::to_vec(&draft).unwrap()).unwrap();
        assert_eq!((back.edits[&0].as_str(), back.fingerprint.text_hash, back.base.len()), ("Guten Tag", 30, 1));
    }
}
