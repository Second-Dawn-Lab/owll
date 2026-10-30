// Which files the Files tab takes, and which message a failure gets.

export const DOC_EXTENSIONS = ["docx", "pptx", "xlsx", "txt", "md", "markdown", "pdf"];
export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "bmp", "webp", "gif"];

export type DropTarget = "document" | "image" | "other";

function extensionOf(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? "";
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
}

/** Where a dropped file belongs: documents to the Files tab, pictures to the Images tab. */
export function dropTarget(path: string): DropTarget {
  const ext = extensionOf(path);
  if (DOC_EXTENSIONS.includes(ext)) return "document";
  if (IMAGE_EXTENSIONS.includes(ext)) return "image";
  return "other";
}

const KNOWN = ["unsupported", "encrypted", "corrupt", "scanned", "too_large", "cancelled", "pack_missing", "model_load", "busy"];

/** The locale key for a failure code from the backend. */
export function docFailureKey(code: string) {
  return (KNOWN.includes(code) ? `files.failed.${code}` : "files.failed.other") as
    | "files.failed.unsupported"
    | "files.failed.encrypted"
    | "files.failed.corrupt"
    | "files.failed.scanned"
    | "files.failed.too_large"
    | "files.failed.cancelled"
    | "files.failed.pack_missing"
    | "files.failed.model_load"
    | "files.failed.busy"
    | "files.failed.other";
}
