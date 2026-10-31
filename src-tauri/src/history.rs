//! Local translation history, stored as a JSON file (newest first).
//!
//! A JSON file keeps the app free of a database dependency; at the 500-entry cap it is
//! small enough to rewrite on every change. Switch to SQLite if search or very large
//! histories are ever needed.

use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

const MAX_ENTRIES: usize = 500;
/// A new entry that extends or shortens the previous one within this window replaces it,
/// so typing one sentence does not leave a trail of partial entries.
const MERGE_WINDOW_MS: u64 = 60_000;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub id: u64,
    pub from: String,
    pub to: String,
    pub source: String,
    pub result: String,
    /// Unix time in milliseconds.
    pub created_at: u64,
    /// "" for a translation, "live" for a live captions session (its lines are in a file of their own).
    #[serde(default)]
    pub kind: String,
    /// A live session: when it started and ended (Unix ms) and how many lines it has.
    #[serde(default)]
    pub started_at: u64,
    #[serde(default)]
    pub ended_at: u64,
    #[serde(default)]
    pub line_count: u32,
}

/// One line of a live captions session.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SessionLine {
    /// Unix time in milliseconds when the line appeared.
    pub t: u64,
    pub original: String,
    pub translation: String,
}

/// The longest conversation kept for one session.
pub const MAX_SESSION_LINES: usize = 2000;

pub struct History {
    path: PathBuf,
    entries: Vec<Entry>,
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

impl History {
    pub fn load() -> Self {
        Self::at(dawn_core::app_dir("owll").join("history.json"))
    }

    /// The history stored in this file (the sessions of live captions next to it).
    pub fn at(path: PathBuf) -> Self {
        let entries = dawn_core::read_json(&path);
        Self { path, entries }
    }

    fn sessions_dir(&self) -> PathBuf {
        self.path.parent().map_or_else(|| PathBuf::from("live-sessions"), |p| p.join("live-sessions"))
    }

    fn session_path(&self, id: u64) -> PathBuf {
        self.sessions_dir().join(format!("{id}.json"))
    }

    fn remove_session_file(&self, id: u64) {
        let _ = std::fs::remove_file(self.session_path(id));
    }

    /// Keep a live captions session as one entry: "Live captions, 14:05-14:42, English -> German, 312 lines". The lines go
    /// to a file of their own (up to 2,000), so the history list stays small.
    pub fn add_session(&mut self, from: String, to: String, started_at: u64, ended_at: u64, lines: &[SessionLine]) -> std::io::Result<u64> {
        let lines = &lines[lines.len().saturating_sub(MAX_SESSION_LINES)..];
        let now = now_ms();
        let id = self.entries.first().map_or(now, |e| now.max(e.id + 1));
        std::fs::create_dir_all(self.sessions_dir())?;
        dawn_core::write_json(&self.session_path(id), &lines)?;
        let preview = |s: &str| s.chars().take(160).collect::<String>();
        let (source, result) = lines.first().map(|l| (preview(&l.original), preview(&l.translation))).unwrap_or_default();
        self.entries.insert(0, Entry { id, from, to, source, result, created_at: now, kind: "live".into(), started_at, ended_at, line_count: lines.len() as u32 });
        for dropped in self.entries.split_off(MAX_ENTRIES.min(self.entries.len())) {
            self.remove_session_file(dropped.id);
        }
        self.save()?;
        Ok(id)
    }

    /// The lines of a saved live session (empty when the entry is not a session or its file is gone).
    pub fn session(&self, id: u64) -> Vec<SessionLine> {
        if !self.entries.iter().any(|e| e.id == id && e.kind == "live") {
            return Vec::new();
        }
        dawn_core::read_json(&self.session_path(id))
    }

    pub fn list(&self) -> Vec<Entry> {
        self.entries.clone()
    }

    pub fn add(&mut self, from: String, to: String, source: String, result: String) -> std::io::Result<()> {
        let now = now_ms();
        if let Some(first) = self.entries.first() {
            let same_pair = first.from == from && first.to == to;
            let growing = source.starts_with(&first.source) || first.source.starts_with(&source);
            if same_pair && growing && now.saturating_sub(first.created_at) < MERGE_WINDOW_MS {
                self.entries.remove(0);
            }
        }
        let id = self.entries.first().map_or(now, |e| now.max(e.id + 1));
        self.entries.insert(0, Entry { id, from, to, source, result, created_at: now, kind: String::new(), started_at: 0, ended_at: 0, line_count: 0 });
        for dropped in self.entries.split_off(MAX_ENTRIES.min(self.entries.len())) {
            self.remove_session_file(dropped.id);
        }
        self.save()
    }

    pub fn delete(&mut self, id: u64) -> std::io::Result<()> {
        self.entries.retain(|e| e.id != id);
        self.remove_session_file(id);
        self.save()
    }

    pub fn clear(&mut self) -> std::io::Result<()> {
        let ids: Vec<u64> = self.entries.iter().map(|e| e.id).collect();
        self.entries.clear();
        for id in ids {
            self.remove_session_file(id);
        }
        self.save()
    }

    fn save(&self) -> std::io::Result<()> {
        dawn_core::write_json(&self.path, &self.entries)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp() -> PathBuf {
        use std::sync::atomic::{AtomicU64, Ordering};
        static N: AtomicU64 = AtomicU64::new(0);
        let dir = std::env::temp_dir().join(format!("owll-history-{}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
        std::fs::create_dir_all(&dir).unwrap();
        dir.join("history.json")
    }

    fn lines(n: usize) -> Vec<SessionLine> {
        (0..n).map(|i| SessionLine { t: 1_000 + i as u64, original: format!("line {i}"), translation: format!("Zeile {i}") }).collect()
    }

    #[test]
    fn a_live_session_is_one_entry_with_its_lines_in_a_file_of_its_own() {
        let path = temp();
        let mut h = History::at(path.clone());
        h.add("en".into(), "de".into(), "Hello".into(), "Hallo".into()).unwrap();
        let id = h.add_session("en".into(), "de".into(), 5_000, 9_000, &lines(312)).unwrap();
        let list = h.list();
        assert_eq!((list.len(), list[0].id, list[0].kind.as_str(), list[0].line_count, list[0].started_at, list[0].ended_at), (2, id, "live", 312, 5_000, 9_000));
        assert_eq!((list[0].source.as_str(), list[0].result.as_str()), ("line 0", "Zeile 0"), "the first line is the preview");
        assert!(path.parent().unwrap().join("live-sessions").join(format!("{id}.json")).exists());
        assert_eq!(h.session(id).len(), 312);
        assert_eq!(h.session(id)[311].translation, "Zeile 311");
        // The history file itself stays small: no lines in it.
        assert!(std::fs::metadata(&path).unwrap().len() < 2_000);
        // A normal entry is not a session.
        assert!(h.session(list[1].id).is_empty());
    }

    #[test]
    fn a_session_keeps_the_last_two_thousand_lines() {
        let mut h = History::at(temp());
        let id = h.add_session("en".into(), "de".into(), 0, 1, &lines(2_150)).unwrap();
        let kept = h.session(id);
        assert_eq!((kept.len(), kept[0].original.as_str()), (MAX_SESSION_LINES, "line 150"));
        assert_eq!(h.list()[0].line_count, MAX_SESSION_LINES as u32);
    }

    #[test]
    fn deleting_or_clearing_removes_the_session_files_and_old_entries_without_the_new_fields_still_load() {
        let path = temp();
        let mut h = History::at(path.clone());
        let a = h.add_session("en".into(), "de".into(), 0, 1, &lines(3)).unwrap();
        let b = h.add_session("en".into(), "de".into(), 0, 1, &lines(3)).unwrap();
        let file = |id: u64| path.parent().unwrap().join("live-sessions").join(format!("{id}.json"));
        h.delete(a).unwrap();
        assert!(!file(a).exists() && file(b).exists());
        h.clear().unwrap();
        assert!(!file(b).exists() && h.list().is_empty());
        // A history file written before sessions existed.
        std::fs::write(&path, r#"[{"id":1,"from":"en","to":"de","source":"Hi","result":"Hallo","createdAt":5}]"#).unwrap();
        let old = History::at(path);
        assert_eq!((old.list().len(), old.list()[0].kind.as_str(), old.list()[0].line_count), (1, "", 0));
    }
}
