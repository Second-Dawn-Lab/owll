//! Text recognition for captured areas and images: picks the OCR engine and languages.
//!
//! Today the engine is Windows' built-in OCR. TODO: RapidOCR (PaddleOCR through ONNX Runtime) as
//! a downloadable fallback for languages Windows lacks; see docs/ocr.md for why it waits.

use dawn_ocr::OcrImage;
use serde::Serialize;

/// Why recognition could not run.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Problem {
    /// "language_missing": the OS has none of the capture languages. "failed": the engine failed.
    /// "unsupported": no engine on this system.
    pub code: &'static str,
    /// The capture languages that are missing (codes such as "de").
    pub languages: Vec<String>,
}

/// Recognize the text in an image. `Ok("")` means the image has no text.
#[cfg(windows)]
pub fn recognize(capture_languages: &[String], active: &[String], image: OcrImage) -> Result<String, Problem> {
    use dawn_ocr::{choose, join, scale, OcrEngine, WindowsOcr};

    let engine = WindowsOcr::new();
    let languages = choose::effective_languages(capture_languages, active);
    let plan = choose::plan(&languages, &engine.available_languages());
    if plan.run.is_empty() {
        return Err(Problem { code: "language_missing", languages: plan.missing });
    }
    let image = scale::fit_max_side(image);
    let big = scale::upscale(&image, scale::upscale_factor(image.width, image.height));
    let mut results = Vec::new();
    for (code, tag) in &plan.run {
        match engine.recognize(&big, tag) {
            Ok(lines) => results.push((code.clone(), join::join_lines(&lines))),
            Err(err) => eprintln!("OCR with {tag} failed: {err}"),
        }
    }
    if results.is_empty() {
        return Err(Problem { code: "failed", languages: Vec::new() });
    }
    Ok(choose::best_result(&results).map(|r| r.1.clone()).unwrap_or_default())
}

#[cfg(not(windows))]
pub fn recognize(_: &[String], _: &[String], _: OcrImage) -> Result<String, Problem> {
    Err(Problem { code: "unsupported", languages: Vec::new() })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrLanguageStatus {
    pub code: String,
    /// "windows" when Windows OCR can read it, "none" otherwise.
    pub engine: &'static str,
    pub tag: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrStatus {
    /// The languages that are used, with the engine that handles each.
    pub languages: Vec<OcrLanguageStatus>,
    /// Everything Windows OCR can read on this machine.
    pub windows_tags: Vec<String>,
}

/// Which engine handles which capture language here (for the settings page).
pub fn status(capture_languages: &[String], active: &[String]) -> OcrStatus {
    #[cfg(windows)]
    let tags = {
        use dawn_ocr::OcrEngine;
        dawn_ocr::WindowsOcr::new().available_languages()
    };
    #[cfg(not(windows))]
    let tags: Vec<String> = Vec::new();
    let languages = dawn_ocr::choose::effective_languages(capture_languages, active)
        .into_iter()
        .map(|code| {
            let tag = dawn_ocr::choose::tag_for(&code, &tags);
            OcrLanguageStatus { engine: if tag.is_some() { "windows" } else { "none" }, tag, code }
        })
        .collect();
    OcrStatus { languages, windows_tags: tags }
}

/// RGBA pixels from a captured frame.
pub fn image_of(frame: dawn_capture::Frame) -> OcrImage {
    OcrImage { width: frame.width, height: frame.height, rgba: frame.rgba }
}
