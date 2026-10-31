// The only module that talks to the Rust backend. Outside Tauri (plain browser during UI
// work) it falls back to an in-memory mock with the same shape.
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { mockInvoke, mockListen } from "./ipc.mock";
import type { Settings } from "./settings/defaults";

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface ModelInfo {
  id: string;
  sources: string[];
  targets: string[];
  sizeBytes: number;
  license: string;
  attribution: string;
}

export interface LanguageInfo {
  code: string;
  name: string;
  nativeName: string;
  /** Quality is known to be unreliable. */
  beta: boolean;
  /** Active: shown in the pickers. */
  installed: boolean;
  /** All its models are on disk (it may be inactive; activating is instant). */
  available: boolean;
  /** Other languages that use the same models, active ones first. */
  includedWith: string[];
  /** English: always available. */
  builtIn: boolean;
  downloading: boolean;
  /** What still has to be downloaded; 0 when its models are shared with an installed language. */
  sizeBytes: number;
  /** All of its models, installed or not. */
  totalBytes: number;
  /** Disk space freed by removing it (models no other installed language needs). */
  freeableBytes: number;
  models: ModelInfo[];
}

export interface PackProgress {
  code: string;
  phase: "downloading" | "verifying" | "extracting" | "done" | "cancelled" | "error";
  done: number;
  total: number;
  errorCode: string | null;
  error: string | null;
}

/** What quick access hands to the popup. */
export interface QuickRequest {
  /** The copied text; null when quick access was opened without a selection. */
  text: string | null;
  /** "Replace" can paste the translation back into the source program. */
  canReplace: boolean;
  /** "quick" (copied text) or "capture" (recognized from the screen or an image). */
  kind: "quick" | "capture";
  problem: OcrProblem | null;
  /** The program that was in front ("chrome.exe"), when known. */
  app: string | null;
}

/** Why text recognition could not give text. */
export interface OcrProblem {
  code: "no_text" | "language_missing" | "failed" | "unsupported";
  /** The capture languages Windows has no recognition for. */
  languages: string[];
}

/** An area capture whose result is shown in the main window's Images tab. */
export interface CaptureResult {
  id: number;
  imageUrl: string;
  text: string;
  problem: OcrProblem | null;
  /** The language the text was read with, when it was one language. */
  ocrLanguage: string | null;
}

export interface OcrOut {
  text: string;
  problem: OcrProblem | null;
}

export interface OcrStatus {
  languages: { code: string; engine: "windows" | "none"; tag: string | null }[];
  windowsTags: string[];
}

export interface ShortcutCheck {
  valid: boolean;
  error: string | null;
  /** The shortcut written the standard way, e.g. "Ctrl+C C". */
  canonical: string | null;
  /** Other Owl-L shortcuts on the same keys. */
  conflicts: string[];
  /** Why a valid shortcut is a bad idea, if it is. */
  warning: { kind: "everyday" } | { kind: "known"; id: string } | null;
}

/** Partial result streamed while a translation runs. */
export interface ActivationOffer {
  /** The language that was just downloaded. */
  code: string;
  /** Other languages its models support, not active yet. */
  languages: string[];
}

export interface DeactivateResult {
  /** Models no active language needs any more. */
  modelIds: string[];
  freedBytes: number;
}

export interface TranslateProgress {
  requestId: number;
  text: string;
  /** fast: a quick draft; refine: the final pass replacing it. */
  pass: "fast" | "refine";
  done: number;
  total: number;
  pivoted: boolean;
  /** A complete draft is already showing; this pass replaces it quietly. */
  draftShown: boolean;
}

/** What language detection found. `code` is set for "ok" (the language may not be installed). */
export interface DetectResult {
  status: "ok" | "unsure" | "none";
  code: string | null;
}

export interface TranslateResult {
  text: string;
  /** The text went through English. */
  pivoted: boolean;
  /** The translated sentences, for word alternatives (empty when there is nothing to pick from). */
  segments: SegmentInfo[];
  /** How many glossary terms were put into the text. */
  glossaryHits: number;
  /** Where they stand in the text (UTF-16 offsets), for highlighting. */
  glossaryTerms: GlossaryTerm[];
}

/** A glossary term in the translation: what it replaced and what was put in. */
export interface GlossaryTerm {
  start: number;
  end: number;
  source: string;
  target: string;
}

/** One translated sentence and where it sits in the result (UTF-16 offsets). */
export interface SegmentInfo {
  source: string;
  /** What the last model stage read. */
  input: string;
  target: string;
  start: number;
  end: number;
  /** The user picked this sentence from the alternatives. */
  pinned: boolean;
}

export interface Alternative {
  word: string;
  /** The whole sentence with this word. */
  text: string;
  /** How the sentence continues from the word on ("erstaunt. ..."). */
  preview: string;
  /** The word that stands there now (listed first). */
  current: boolean;
}

export interface GlossaryEntry {
  id: number;
  from: string;
  to: string;
  source: string;
  target: string;
  matchCase: boolean;
  wholeWord: boolean;
  enabled: boolean;
}

/** One named glossary: its own list of terms. */
export interface NamedGlossary {
  id: string;
  name: string;
  from: string | null;
  to: string | null;
  entries: GlossaryEntry[];
}

export interface Glossaries {
  lists: NamedGlossary[];
}

export interface DocInfo {
  path: string;
  name: string;
  kind: "docx" | "pptx" | "xlsx" | "txt" | "markdown" | "pdf";
  sizeBytes: number;
  detection: "ok" | "unsure" | "none";
  detected: string | null;
  tooLarge: boolean;
}

export interface DocDone {
  output: string;
  kind: DocInfo["kind"];
  units: number;
  translated: number;
  parts: [number, string] | null;
  skipped: string[];
}

/** Where a segment of an open document sits; the window turns it into a label ("Slide 4 · Notes"). */
export interface EditHeader {
  part: string;
  name: string | null;
  number: number | null;
  cell: string | null;
}

export interface EditSegment {
  /** The unit it translates, or null for text that is left as it was. */
  unit: number | null;
  header: EditHeader;
  source: string;
  /** Formatting of the marked stretches: 1 bold, 2 italic, 4 underline, 8 link. */
  styles: number[];
  /** No markers or address tokens: word alternatives work in its translation. */
  plain: boolean;
  translation: string | null;
  /** The engine's translation, only for an edited segment. */
  base: string | null;
  hits: number;
  edited: boolean;
}

export interface EditOpened {
  path: string;
  name: string;
  kind: DocInfo["kind"];
  from: string;
  to: string;
  segments: EditSegment[];
  units: number;
  skipped: string[];
  resumed: boolean;
}

/** A document was translated for editing; its translations wait in a draft. */
export interface EditTranslated {
  draftId: string;
  path: string;
  kind: DocInfo["kind"];
  units: number;
  skipped: string[];
}

export interface DraftInfo {
  id: string;
  name: string;
  path: string;
  kind: DocInfo["kind"];
  from: string;
  to: string;
  updatedAt: number;
  edited: number;
  units: number;
  /** "ok", "missing" or "maybe_changed". */
  status: "ok" | "missing" | "maybe_changed";
}

/** A dictionary pack: one per language pair, both directions inside. */
export interface DictInfo {
  id: string;
  languages: string[];
  sizeBytes: number;
  installed: boolean;
  license: string;
  attribution: string;
  sourceUrl: string;
  /** A thin or rough dictionary. */
  beta: boolean;
  /** Entries of the larger direction. */
  entries: number;
}

export interface DictEntry {
  head: string;
  pos: string;
  grammar: string;
  senses: { gloss: string; words: { w: string; n: string }[]; tags: string[] }[];
  examples: { text: string; translation: string }[];
  /** "head": the word is the headword; "form": it is an inflected form of it. */
  matched: "head" | "form";
}

export interface DictLookup {
  status: "ok" | "no_pack" | "unavailable";
  /** The pack to download when `status` is "no_pack". */
  pack: DictInfo | null;
  from: string;
  to: string;
  entries: DictEntry[];
  suggestions: string[];
}

export interface DictProgress {
  id: string;
  step: "downloading" | "verifying" | "extracting" | "done" | "failed" | "cancelled";
  done: number;
  total: number;
  error: string | null;
}

/** One caption line: what was read and its translation. */
export interface LiveLine {
  original: string;
  translation: string;
}

export interface LiveLines {
  /** The first line is the last one shown before, now longer: it replaces it. */
  replaceLast: boolean;
  lines: LiveLine[];
  from: string;
  to: string;
  ocrMs: number;
  translateMs: number;
}

export interface LiveStatus {
  state: "running" | "paused" | "black" | "no_text" | "ocr_missing" | "pack_missing" | "undetected" | "error";
  languages: string[];
  message: string;
}

export interface LiveState {
  running: boolean;
  /** Unix ms when the running session started. */
  startedAt: number;
  paused: boolean;
  locked: boolean;
  source: string;
  target: string;
}

/** What the list window asks for; the shape is `PickerSpec` in components/pickerModel.ts. */
export type PickerSpecLike = import("./components/pickerModel").PickerSpec;

export interface DocFailed {
  code: string;
  message: string;
}

export interface HistoryEntry {
  id: number;
  from: string;
  to: string;
  source: string;
  result: string;
  /** Unix time in milliseconds. */
  createdAt: number;
  /** "" for a translation, "live" for a live captions session. */
  kind?: string;
  startedAt?: number;
  endedAt?: number;
  lineCount?: number;
}

export class IpcError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(cmd: string, args?: Record<string, unknown> | Uint8Array, headers?: Record<string, string>): Promise<T> {
  try {
    return isTauri ? await invoke<T>(cmd, args, headers ? { headers } : undefined) : await mockInvoke<T>(cmd, args instanceof Uint8Array ? undefined : args);
  } catch (e) {
    const err = e as { code?: string; message?: string };
    throw new IpcError(err.code ?? "unknown", err.message ?? String(e));
  }
}

function on<T>(event: string, handler: (payload: T) => void): Promise<() => void> {
  return isTauri ? listen<T>(event, (e) => handler(e.payload)) : mockListen(event, handler);
}

export const ipc = {
  // Translation. Swap the Rust engine later without touching the UI.
  translate: (requestId: number, text: string, from: string, to: string) =>
    call<TranslateResult>("translate", { requestId, text, from, to }),
  detectLanguage: (text: string) => call<DetectResult>("detect_language", { text }),
  /** The target to use so that a text is never translated into its own language. */
  smartTarget: (source: string, target: string) => call<string>("smart_target", { source, target }),
  captureStart: (hideMain = false) => call<void>("capture_start", { hideMain }),
  captureCancel: () => call<void>("capture_cancel"),
  captureFinish: (label: string, rect: number[], viewport: number[]) => call<void>("capture_finish", { label, rect, viewport }),
  captureOverlayInfo: (label: string) => call<{ imageUrl: string } | null>("capture_overlay_info", { label }),
  captureOverlayReady: (label: string) => call<void>("capture_overlay_ready", { label }),
  /** Recognize the text in an encoded image (PNG, JPEG, BMP, WebP, GIF). */
  /** Recognize the text in an image; `language` is the source language the user picked ("auto" or none: the capture languages). */
  ocrImage: (bytes: Uint8Array, language?: string) => call<OcrOut>("ocr_image", bytes, language && language !== "auto" ? { "x-ocr-language": language } : undefined),
  /** Read the last area capture again with another source language (no new screenshot). */
  ocrCaptureAgain: (language: string) => call<OcrOut>("ocr_capture_again", { language }),
  ocrStatus: () => call<OcrStatus>("ocr_status"),
  openWindowsLanguageSettings: () => call<void>("open_windows_language_settings"),
  quickReplace: (text: string) => call<void>("quick_replace", { text }),
  listLanguages: () => call<LanguageInfo[]>("list_languages"),
  installLanguage: (code: string) => call<void>("install_language", { code }),
  cancelInstall: (code: string) => call<void>("cancel_install", { code }),
  activateLanguage: (code: string) => call<void>("activate_language", { code }),
  activateLanguages: (codes: string[]) => call<void>("activate_languages", { codes }),
  deactivateLanguage: (code: string) => call<DeactivateResult>("deactivate_language", { code }),
  deleteModelFiles: (ids: string[]) => call<number>("delete_model_files", { ids }),
  takeActivationOffer: () => call<ActivationOffer | null>("take_activation_offer"),
  /** Delete a language's files and download it again. */
  repairLanguage: (code: string) => call<void>("repair_language", { code }),

  getSettings: () => call<Settings>("get_settings"),
  setSettings: (patch: Partial<Settings>) => call<Settings>("set_settings", { patch }),

  historyList: () => call<HistoryEntry[]>("history_list"),
  historyAdd: (from: string, to: string, source: string, result: string) =>
    call<void>("history_add", { from, to, source, result }),
  historyDelete: (id: number) => call<void>("history_delete", { id }),
  historyClear: () => call<void>("history_clear"),

  openSettings: (page?: string) => call<void>("open_settings", { page }),
  /** The page the settings window should start on, if one was requested. */
  takeSettingsPage: () => call<string | null>("take_settings_page"),
  quit: () => call<void>("quit_app"),
  /** Adds a timestamped line to the backend trace when DAWN_TRACE is set. */
  trace: (msg: string) => call<void>("trace", { msg }),
  setTrayLanguage: (lang: string) => call<void>("set_tray_language", { lang }),
  closeAction: (action: "background" | "quit", remember: boolean) =>
    call<void>("close_action", { action, remember }),

  checkShortcut: (name: "translate" | "capture" | "live", text: string) => call<ShortcutCheck>("check_shortcut", { name, text }),
  /** Why the global shortcuts could not start, if they could not. */
  hotkeyStatus: () => call<string | null>("hotkey_status"),
  quickTake: () => call<QuickRequest | null>("quick_take"),
  quickHide: () => call<void>("quick_hide"),
  quickSetPinned: (pinned: boolean) => call<void>("quick_set_pinned", { pinned }),
  quickOpenInMain: (text: string) => call<void>("quick_open_in_main", { text }),
  quickBlockApp: (name: string) => call<void>("quick_block_app", { name }),
  takeQuickText: () => call<string | null>("take_quick_text"),
  alternatives: (from: string, to: string, source: string, input: string, sentence: string, wordStart: number, current: string) =>
    call<Alternative[]>("alternatives", { from, to, source, input, sentence, wordStart, current }),
  /** Up to three whole-sentence alternatives for a sentence, different from the current translation. */
  sentenceAlternatives: (from: string, to: string, source: string, input: string, current: string) =>
    call<string[]>("sentence_alternatives", { from, to, source, input, current }),
  pinTranslation: (from: string, to: string, source: string, input: string, translation: string) =>
    void call<void>("pin_translation", { from, to, source, input, translation }),
  glossariesGet: () => call<Glossaries>("glossaries_get"),
  glossariesSet: (glossaries: Glossaries) => call<Glossaries>("glossaries_set", { glossaries }),
  /** Switch to the glossary with this id, or off with "". Shared by the Text tab, the Files tab and the popup. */
  glossarySetActive: (id: string) => call<void>("glossary_set_active", { id }),
  glossaryImportCsv: (list: string, text: string, from: string, to: string) =>
    call<{ added: number; updated: number; skipped: number; glossaries: Glossaries }>("glossary_import_csv", { list, text, from, to }),
  glossaryExportCsv: (list: string) => call<string>("glossary_export_csv", { list }),
  glossaryClear: () => call<Glossaries>("glossary_clear"),
  onGlossaryChanged: (cb: () => void) => on<null>("glossary-changed", cb),
  docInspect: (path: string) => call<DocInfo>("doc_inspect", { path }),
  docDefaultOutput: (path: string, to: string, dir?: string | null) => call<string>("doc_default_output", { path, to, dir: dir ?? null }),
  docTranslate: (path: string, from: string, to: string, output: string) => call<void>("doc_translate", { path, from, to, output }),
  docCancel: () => call<void>("doc_cancel"),
  docOpen: (path: string) => call<void>("doc_open", { path }),
  docShowInFolder: (path: string) => call<void>("doc_show_in_folder", { path }),
  readDroppedFile: async (path: string): Promise<Uint8Array> => (isTauri ? new Uint8Array(await invoke<ArrayBuffer>("read_dropped_file", { path })) : new Uint8Array()),
  onDocProgress: (cb: (p: { done: number; total: number }) => void) => on<{ done: number; total: number }>("doc-progress", cb),
  onDocDone: (cb: (d: DocDone) => void) => on<DocDone>("doc-done", cb),
  /** Translate a document for editing (progress and failures use the doc events); the result waits in a draft. */
  pickerOpen: (spec: unknown) => call<void>("picker_open", { spec }),
  pickerSpec: () => call<PickerSpecLike | null>("picker_spec"),
  pickerChoose: (value: string) => call<void>("picker_choose", { value }),
  pickerClose: () => call<void>("picker_close"),
  onPickerSpec: (cb: () => void) => on<null>("picker-spec", cb),
  onPickerChoice: (cb: (e: { id: string; value: string }) => void) => on<{ id: string; value: string }>("picker-choice", cb),
  onPickerClosed: (cb: (e: { id: string }) => void) => on<{ id: string }>("picker-closed", cb),
  liveState: () => call<LiveState>("live_state"),
  /** Start live captions (draw the region), or stop them when they run. */
  liveToggle: () => call<void>("live_toggle"),
  liveStop: () => call<void>("live_stop"),
  livePause: (paused: boolean) => call<void>("live_pause", { paused }),
  liveLock: (locked: boolean) => call<void>("live_lock", { locked }),
  liveLanguages: (source: string, target: string) => call<void>("live_languages", { source, target }),
  liveChangeRegion: () => call<void>("live_change_region"),
  liveReplaceBar: () => call<void>("live_replace_bar"),
  liveClose: () => call<void>("live_close"),
  /** Keep the conversation of the session as one history entry. Resolves false when the history is off. */
  liveSaveSession: (from: string, to: string, startedAt: number, lines: { t: number; original: string; translation: string }[]) =>
    call<boolean>("live_save_session", { from, to, startedAt, lines }),
  liveSetSaveChoice: (choice: "ask" | "always" | "never") => call<void>("live_set_save_choice", { choice }),
  historySession: (id: number) => call<{ t: number; original: string; translation: string }[]>("history_session", { id }),
  onLiveEnded: (cb: (startedAt: number) => void) => on<number>("live-ended", cb),
  onLiveReset: (cb: (startedAt: number) => void) => on<number>("live-reset", cb),
  liveSaveText: (path: string, text: string) => call<void>("live_save_text", { path, text }),
  onShortcutDetected: (cb: (name: string) => void) => on<string>("shortcut-detected", cb),
  onLiveLines: (cb: (d: LiveLines) => void) => on<LiveLines>("live-lines", cb),
  onLiveStatus: (cb: (d: LiveStatus) => void) => on<LiveStatus>("live-status", cb),
  onLiveCleared: (cb: () => void) => on<null>("live-cleared", cb),
  onLiveLocked: (cb: (locked: boolean) => void) => on<boolean>("live-locked", cb),
  dictList: () => call<DictInfo[]>("dict_list"),
  dictLookup: (word: string, lang: string, partner: string) => call<DictLookup>("dict_lookup", { word, lang, partner }),
  dictInstall: (id: string) => call<void>("dict_install", { id }),
  dictCancel: (id: string) => call<void>("dict_cancel", { id }),
  dictRemove: (id: string) => call<void>("dict_remove", { id }),
  onDictProgress: (cb: (p: DictProgress) => void) => on<DictProgress>("dict-progress", cb),
  onDictChanged: (cb: () => void) => on<null>("dict-changed", cb),
  editStart: (path: string, from: string, to: string) => call<void>("edit_start", { path, from, to }),
  onEditTranslated: (cb: (d: EditTranslated) => void) => on<EditTranslated>("edit-translated", cb),
  /** Open a draft in the editor. `path` is the document when it was moved. */
  editResume: (id: string, path?: string) => call<EditOpened>("edit_resume", { id, path }),
  editDraftSave: (path: string, edits: Record<number, string>) => call<void>("edit_draft_save", { path, edits }),
  /** The sentences of a segment's translation, or null when the text is not what the engine makes. */
  editAnalyse: (unit: number, current: string) => call<TranslateResult | null>("edit_analyse", { unit, current }),
  editRetranslate: (unit: number) => call<{ text: string; hits: number }>("edit_retranslate", { unit }),
  editSave: (path: string, output: string, edits: Record<number, string>, keepDraft: boolean) => call<{ output: string; skipped: string[] }>("edit_save", { path, output, edits, keepDraft }),
  editClose: (path: string, deleteDraft: boolean) => call<void>("edit_close", { path, deleteDraft }),
  draftsList: () => call<DraftInfo[]>("drafts_list"),
  draftDelete: (id: string) => call<void>("draft_delete", { id }),
  onDocFailed: (cb: (d: DocFailed) => void) => on<DocFailed>("doc-failed", cb),
  takeCaptureResult: (lastSeen: number | null) => call<CaptureResult | null>("take_capture_result", { lastSeen }),

  /** Where the maximize button is (physical pixels), so Windows can show Snap Layouts for it. */
  setMaximizeRect: (rect: [number, number, number, number]) => call<void>("set_maximize_rect", { rect }),
  onMaximizeHover: (cb: (hovering: boolean) => void) => on<boolean>("maximize-hover", cb),
  onCaptureOpen: (cb: () => void) => on<null>("capture-open", cb),
  onQuickOpen: (cb: () => void) => on<null>("quick-open", cb),
  onQuickText: (cb: () => void) => on<null>("quick-text", cb),
  onCaptureResult: (cb: () => void) => on<null>("capture-result", cb),
  onSettingsChanged: (cb: (s: Settings) => void) => on<Settings>("settings-changed", cb),
  onTranslateProgress: (cb: (p: TranslateProgress) => void) => on<TranslateProgress>("translate-progress", cb),
  onPackProgress: (cb: (p: PackProgress) => void) => on<PackProgress>("pack-progress", cb),
  onActivationOffer: (cb: () => void) => on<null>("activation-offer", cb),
  onPacksChanged: (cb: () => void) => on<null>("packs-changed", cb),
  onHistoryChanged: (cb: () => void) => on<null>("history-changed", cb),
  onCloseRequested: (cb: () => void) => on<null>("close-requested", cb),
  onSettingsNavigate: (cb: (page: string) => void) => on<string>("settings-navigate", cb),
};

/** "main", "settings", "quick" or "overlay-N" (one capture overlay per monitor). */
export function windowLabel(): string {
  if (isTauri) return getCurrentWebviewWindow().label;
  return new URLSearchParams(location.search).get("window") ?? "main";
}
