import { describe, expect, it } from "vitest";
import { decidePdf, rememberPdf } from "./pdfChoice";

const settings = { pdfOutput: "docx" as const, pdfAsk: true };

describe("the PDF output question", () => {
  it("is not asked when there is no PDF", () => {
    expect(decidePdf(0, settings, true)).toEqual({ ask: false, format: "docx" });
  });

  it("is asked for PDFs when keeping the layout exists and the user did not switch the question off", () => {
    expect(decidePdf(2, settings, true)).toEqual({ ask: true, format: "docx" });
    expect(decidePdf(2, { pdfOutput: "pdf", pdfAsk: false }, true)).toEqual({ ask: false, format: "pdf" });
  });

  it("converts to Word without asking while keeping the layout is not built", () => {
    expect(decidePdf(3, { pdfOutput: "pdf", pdfAsk: true }, false)).toEqual({ ask: false, format: "docx" });
  });

  it("remembers the last answer and the 'do not ask again' box", () => {
    expect(rememberPdf("pdf", false)).toEqual({ pdfOutput: "pdf", pdfAsk: true });
    expect(rememberPdf("docx", true)).toEqual({ pdfOutput: "docx", pdfAsk: false });
  });
});
