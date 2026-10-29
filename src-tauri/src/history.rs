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
}

pub struct History {
    path: PathBuf,
    entries: Vec<Entry>,
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

impl History {
    pub fn load() -> Self {
        let path = dawn_core::app_dir("owll").join("history.json");
        let entries = dawn_core::read_json(&path);
        Self { path, entries }
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
        self.entries.insert(0, Entry { id, from, to, source, result, created_at: now });
        self.entries.truncate(MAX_ENTRIES);
        self.save()
    }

    pub fn delete(&mut self, id: u64) -> std::io::Result<()> {
        self.entries.retain(|e| e.id != id);
        self.save()
    }

    pub fn clear(&mut self) -> std::io::Result<()> {
        self.entries.clear();
        self.save()
    }

    fn save(&self) -> std::io::Result<()> {
        dawn_core::write_json(&self.path, &self.entries)
    }
}
