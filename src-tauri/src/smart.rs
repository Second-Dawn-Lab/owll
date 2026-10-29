//! Never translate X into X: pick a sensible target when the source equals the target.

/// The target to use. Unchanged unless source and target are the same language: then English
/// text goes to the last non-English target the user picked, and anything else goes to English.
pub fn smart_target(source: &str, target: &str, last_foreign: &str) -> String {
    if source != target || source == "auto" {
        return target.to_string();
    }
    if source == "en" {
        if last_foreign.is_empty() || last_foreign == "en" {
            "de".to_string()
        } else {
            last_foreign.to_string()
        }
    } else {
        "en".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::smart_target;

    #[test]
    fn a_different_target_is_left_alone() {
        assert_eq!(smart_target("de", "en", "ur"), "en");
        assert_eq!(smart_target("en", "de", "ur"), "de");
        assert_eq!(smart_target("auto", "de", "ur"), "de");
    }

    #[test]
    fn english_text_goes_to_the_last_foreign_target() {
        assert_eq!(smart_target("en", "en", "ur"), "ur");
        assert_eq!(smart_target("en", "en", "fr"), "fr");
    }

    #[test]
    fn other_text_goes_to_english() {
        assert_eq!(smart_target("de", "de", "ur"), "en");
        assert_eq!(smart_target("ur", "ur", "ur"), "en");
    }

    #[test]
    fn english_without_a_usable_last_target_gets_a_default() {
        assert_eq!(smart_target("en", "en", ""), "de");
        assert_eq!(smart_target("en", "en", "en"), "de");
    }
}
