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
    recognize_impl(capture_languages, active, image)
}

/// For live captions: the recognized text as it is on screen, one line per screen line (not joined into sentences), read once at
/// one scale. Lines keep their identity while captions scroll, which is how new lines are told from old ones.
#[cfg(windows)]
pub fn recognize_screen_lines(capture_languages: &[String], active: &[String], image: OcrImage) -> Result<String, Problem> {
    use dawn_ocr::{choose, scale, OcrEngine, WindowsOcr};

    let engine = WindowsOcr::new();
    let languages = choose::effective_languages(capture_languages, active);
    let plan = choose::plan(&languages, &engine.available_languages());
    if plan.run.is_empty() {
        return Err(Problem { code: "language_missing", languages: plan.missing });
    }
    let image = scale::fit_max_side(image);
    let factor = scale::scales(image.width, image.height).first().copied().unwrap_or(1);
    let big = scale::upscale(&image, factor);
    let mut results = Vec::new();
    for (code, tag) in &plan.run {
        if let Ok(lines) = engine.recognize(&big, tag) {
            results.push((code.clone(), lines.iter().map(|l| l.text.trim()).filter(|t| !t.is_empty()).collect::<Vec<_>>().join("\n")));
        }
    }
    if results.is_empty() {
        return Err(Problem { code: "failed", languages: Vec::new() });
    }
    Ok(choose::best_result(&results).map(|r| r.1.clone()).unwrap_or_default())
}

#[cfg(not(windows))]
pub fn recognize_screen_lines(_: &[String], _: &[String], _: OcrImage) -> Result<String, Problem> {
    Err(Problem { code: "unsupported", languages: Vec::new() })
}

#[cfg(windows)]
fn recognize_impl(capture_languages: &[String], active: &[String], image: OcrImage) -> Result<String, Problem> {
    use dawn_ocr::{choose, fix, join, scale, OcrEngine, WindowsOcr};

    let engine = WindowsOcr::new();
    let languages = choose::effective_languages(capture_languages, active);
    let plan = choose::plan(&languages, &engine.available_languages());
    if plan.run.is_empty() {
        return Err(Problem { code: "language_missing", languages: plan.missing });
    }
    let image = scale::fit_max_side(image);
    // Small text is read at two scales (2x and 3x): tiny letters and commas come out right at one scale and
    // wrong at the other, so the cleaner reading wins (see `scale::scales`).
    let enlarged: Vec<_> = scale::scales(image.width, image.height).iter().map(|f| scale::upscale(&image, *f)).collect();
    let mut results = Vec::new();
    for (code, tag) in &plan.run {
        let readings: Vec<String> = enlarged
            .iter()
            .filter_map(|big| match engine.recognize(big, tag) {
                Ok(lines) => Some(join::join_lines(&lines)),
                Err(err) => {
                    eprintln!("OCR with {tag} failed: {err}");
                    None
                }
            })
            .collect();
        if readings.is_empty() {
            continue;
        }
        let best = fix::cleaner(&readings);
        results.push((code.clone(), fix::fix_slips(&readings[best])));
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

/// Measures the small-text improvements on generated images (Windows only; needs PowerShell, System.Drawing
/// and an English OCR language in Windows):
///
/// ```text
/// cargo test -p owll measure -- --ignored --nocapture
/// ```
#[cfg(all(test, windows))]
mod measure {
    use super::*;

    const LINES: [&str; 4] = [
        "Language detection is local, hub and spoke translation (int8), stored on disk.",
        "Packs are converted to CTranslate2 (int8), with the same license as the source model.",
        "Check for updates, restart the app, and the hub keeps working offline.",
        "Download the pack, verify the checksum, and install it with one click.",
    ];

    fn render(dir: &std::path::Path, px: u32) -> Vec<std::path::PathBuf> {
        let script = r#"
Add-Type -AssemblyName System.Drawing
$lines = @(LINES)
$i = 0
foreach ($text in $lines) {
  $font = New-Object System.Drawing.Font('Segoe UI', PX, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $probe = New-Object System.Drawing.Bitmap 10, 10
  $g0 = [System.Drawing.Graphics]::FromImage($probe)
  $size = $g0.MeasureString($text, $font)
  $bmp = New-Object System.Drawing.Bitmap ([int]$size.Width + 16), ([int]$size.Height + 12)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::White)
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
  $g.DrawString($text, $font, [System.Drawing.Brushes]::Black, 8, 6)
  $bmp.Save((Join-Path 'DIR' ("line$i.png")), [System.Drawing.Imaging.ImageFormat]::Png)
  $i++
}
"#
        .replace("PX", &px.to_string())
        .replace("DIR", &dir.to_string_lossy())
        .replace("LINES", &LINES.iter().map(|l| format!("'{l}'")).collect::<Vec<_>>().join(","));
        let status = std::process::Command::new("powershell").args(["-NoProfile", "-Command", &script]).status().expect("powershell");
        assert!(status.success());
        (0..LINES.len()).map(|i| dir.join(format!("line{i}.png"))).collect()
    }

    fn load(path: &std::path::Path) -> OcrImage {
        let img = image::open(path).unwrap().to_rgba8();
        OcrImage { width: img.width(), height: img.height(), rgba: img.into_raw() }
    }

    fn distance(a: &str, b: &str) -> usize {
        let (a, b): (Vec<char>, Vec<char>) = (a.chars().collect(), b.chars().collect());
        let mut row: Vec<usize> = (0..=b.len()).collect();
        for i in 1..=a.len() {
            let mut prev = row[0];
            row[0] = i;
            for j in 1..=b.len() {
                let cur = row[j];
                row[j] = (prev + usize::from(a[i - 1] != b[j - 1])).min(row[j] + 1).min(row[j - 1] + 1);
                prev = cur;
            }
        }
        row[b.len()]
    }

    /// The pipeline of v0.1: one reading at the usual scale, no repairs.
    fn before(image: &OcrImage) -> String {
        use dawn_ocr::{join, scale, OcrEngine, WindowsOcr};
        let engine = WindowsOcr::new();
        let tag = dawn_ocr::choose::tag_for("en", &engine.available_languages()).expect("an English OCR language");
        let big = scale::upscale(image, scale::upscale_factor(image.width, image.height));
        join::join_lines(&engine.recognize(&big, &tag).unwrap())
    }

    #[test]
    #[ignore = "needs Windows OCR for English and PowerShell"]
    fn small_text_before_and_after() {
        let dir = std::env::temp_dir().join(format!("owll-ocr-measure-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let (mut total_before, mut total_after, mut total_chars) = (0, 0, 0);
        for px in [9u32, 10, 11, 12] {
            let paths = render(&dir, px);
            let (mut b_sum, mut a_sum, mut n) = (0, 0, 0);
            for (path, truth) in paths.iter().zip(LINES) {
                let image = load(path);
                let old = before(&image);
                let new = recognize(&["en".to_string()], &["en".to_string()], image).unwrap_or_default();
                let (db, da) = (distance(&old, truth), distance(&new, truth));
                println!("{px}px  before {db:>2}  after {da:>2}\n   truth  {truth}\n   before {old}\n   after  {new}");
                b_sum += db;
                a_sum += da;
                n += truth.chars().count();
            }
            println!("== {px}px: character errors before {b_sum}, after {a_sum}, of {n} characters\n");
            total_before += b_sum;
            total_after += a_sum;
            total_chars += n;
        }
        println!("== total: before {total_before}, after {total_after}, of {total_chars} characters");
        assert!(total_after <= total_before, "the new pipeline must not be worse than the old one");
    }

    /// Which enlargement reads tiny text best? Prints the character errors per factor and sharpening.
    #[test]
    #[ignore = "needs Windows OCR for English and PowerShell"]
    fn scale_sweep() {
        use dawn_ocr::{join, scale, OcrEngine, WindowsOcr};
        let engine = WindowsOcr::new();
        let tag = dawn_ocr::choose::tag_for("en", &engine.available_languages()).expect("an English OCR language");
        let dir = std::env::temp_dir().join(format!("owll-ocr-sweep-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        for px in [8u32, 9, 10] {
            let images: Vec<OcrImage> = render(&dir, px).iter().map(|p| load(p)).collect();
            for factor in [1u32, 2, 3, 4, 5, 6] {
                for strength in [0.0f32] {
                    let errors: usize = images
                        .iter()
                        .zip(LINES)
                        .map(|(image, truth)| {
                            let big = scale::upscale(image, factor);
                            let _ = strength;
                            let text = engine.recognize(&big, &tag).map(|l| join::join_lines(&l)).unwrap_or_default();
                            distance(&text, truth)
                        })
                        .sum();
                    println!("{px}px  x{factor}  sharpen {strength:.1}  errors {errors}");
                }
            }
        }
    }
}
