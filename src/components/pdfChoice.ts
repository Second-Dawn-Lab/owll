// What happens to PDFs in a batch: converted to a Word document, or (when the feature exists) kept as PDF.
//
// Keeping the layout of a PDF needs a PDF engine that can edit text in place and a font for every script;
// that is not built yet (see docs/documents.md, "Keep as PDF"), so today every PDF becomes a Word document
// and the question is not asked. The setting and the decision rules are in place so the question appears as
// soon as the second answer exists.

export type PdfFormat = "pdf" | "docx";

/** Is "Keep as PDF" implemented? When false, PDFs are always converted and nothing is asked. */
export const KEEP_PDF_AVAILABLE = false;

export interface PdfSettings {
  /** The last choice, used as the preselected answer. */
  pdfOutput: PdfFormat;
  /** Ask before every batch that has PDFs. */
  pdfAsk: boolean;
}

export interface PdfDecision {
  /** Show the question before translating. */
  ask: boolean;
  /** The format to use when the question is not shown. */
  format: PdfFormat;
}

export function decidePdf(pdfCount: number, settings: PdfSettings, keepAvailable = KEEP_PDF_AVAILABLE): PdfDecision {
  if (pdfCount === 0 || !keepAvailable) return { ask: false, format: "docx" };
  return { ask: settings.pdfAsk, format: settings.pdfOutput };
}

/** What to store after the user answered the question. */
export function rememberPdf(choice: PdfFormat, dontAskAgain: boolean): PdfSettings {
  return { pdfOutput: choice, pdfAsk: !dontAskAgain };
}
