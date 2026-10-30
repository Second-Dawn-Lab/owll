// The place label of a segment ("Slide 4 · Notes", "Sheet Sales · B5", "Page 2") as a locale key with its values.

import type { EditHeader } from "../ipc";

export interface Label {
  key: string;
  values: Record<string, string | number>;
}

export function headerLabel(h: EditHeader): Label {
  const n = h.number ?? 0;
  switch (h.part) {
    case "sheet":
      if (h.name && h.cell) return { key: "ed.h.sheet", values: { name: h.name, cell: h.cell } };
      if (h.name) return { key: "ed.h.sheetOnly", values: { name: h.name, n } };
      return { key: "ed.h.sheetText", values: { n } };
    case "slide":
    case "notes":
    case "page":
      return { key: `ed.h.${h.part}`, values: { n } };
    case "header":
    case "footer":
    case "footnotes":
    case "endnotes":
    case "comments":
    case "comment":
    case "drawing":
    case "paragraph":
      return { key: `ed.h.${h.part}`, values: { n } };
    default:
      return { key: "ed.h.body", values: { n } };
  }
}
