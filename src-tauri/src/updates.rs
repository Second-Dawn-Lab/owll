//! When to check for a new Owl-L version.
//!
//! The check itself is done by `tauri-plugin-updater` from the frontend (it asks `latest.json` on
//! the latest GitHub release). This module only decides whether the quiet startup check is due,
//! so Owl-L contacts GitHub at most once a day.

use std::time::{SystemTime, UNIX_EPOCH};

use tauri::State;

use crate::commands::AppState;

/// The quiet check at startup runs at most this often.
pub const CHECK_INTERVAL_SECS: u64 = 24 * 60 * 60;

/// Is a quiet check due? `last` is the unix time of the previous one (0 = never).
/// A clock that went backwards counts as due, so a wrong clock cannot block checks forever.
pub fn check_due(last: u64, now: u64) -> bool {
    last == 0 || now < last || now - last >= CHECK_INTERVAL_SECS
}

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// Called by the main window at startup. When a check is due it records the attempt (even if the
/// check then fails, so an offline machine is not retried on every start) and answers `true`.
#[tauri::command]
pub fn update_check_due(state: State<'_, AppState>) -> bool {
    let mut settings = state.settings.lock().unwrap();
    let now = now_secs();
    if !check_due(settings.last_update_check, now) {
        return false;
    }
    settings.last_update_check = now;
    if let Err(err) = settings.save() {
        eprintln!("could not save the update check time: {err}");
    }
    true
}

/// A manual check ("Check for updates") also counts, so the quiet check does not repeat it.
#[tauri::command]
pub fn update_check_done(state: State<'_, AppState>) {
    let mut settings = state.settings.lock().unwrap();
    settings.last_update_check = now_secs();
    let _ = settings.save();
}

#[cfg(test)]
mod tests {
    use super::*;

    const DAY: u64 = CHECK_INTERVAL_SECS;

    #[test]
    fn the_first_start_checks() {
        assert!(check_due(0, 1_000_000));
    }

    #[test]
    fn a_second_start_within_a_day_does_not_check() {
        let last = 1_000_000;
        assert!(!check_due(last, last));
        assert!(!check_due(last, last + 60));
        assert!(!check_due(last, last + DAY - 1));
    }

    #[test]
    fn a_start_a_day_later_checks_again() {
        let last = 1_000_000;
        assert!(check_due(last, last + DAY));
        assert!(check_due(last, last + 10 * DAY));
    }

    #[test]
    fn a_clock_set_back_does_not_block_checks() {
        assert!(check_due(2_000_000, 1_000_000));
    }
}
