// Browser-only stand-in for the Rust commands, so the UI can be developed with `pnpm dev`
// in a plain browser. Mirrors src-tauri/src/commands.rs; not used inside Tauri.
import type { HistoryEntry, LanguageInfo, PackProgress, TranslateResult } from "./ipc";
import { defaultSettings, type Settings } from "./settings/defaults";

const bus = new EventTarget();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fail = (code: string, message: string) => Promise.reject({ code, message });

function emit(event: string, payload: unknown) {
  bus.dispatchEvent(new CustomEvent(event, { detail: payload }));
}

function load<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "") as T;
  } catch {
    return fallback;
  }
}

const save = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: keep going */
  }
};

const CATALOG = [
  { code: "de", name: "German", nativeName: "Deutsch", sizeBytes: 129_428_504 },
  { code: "ur", name: "Urdu", nativeName: "اردو", sizeBytes: 131_255_586 },
  { code: "fr", name: "French", nativeName: "Français", sizeBytes: 130_000_000 },
];

/** Installed language codes (persisted so reloads keep them). */
const installed = (): string[] => load<string[]>("owll.installed", ["de"]);
const downloading = new Map<string, boolean>(); // code -> cancel requested

function languages(): LanguageInfo[] {
  const have = installed();
  return [
    { code: "en", name: "English", nativeName: "English", beta: false, available: true, includedWith: [], totalBytes: 0, freeableBytes: 0, installed: true, builtIn: true, downloading: false, sizeBytes: 0, models: [] },
    ...CATALOG.map((l): LanguageInfo => ({
      ...l,
      beta: l.code === "ur",
      available: have.includes(l.code),
      includedWith: [],
      totalBytes: l.sizeBytes,
      freeableBytes: have.includes(l.code) ? l.sizeBytes : 0,
      installed: have.includes(l.code),
      builtIn: false,
      downloading: downloading.has(l.code),
      models: [
        { id: `opus-mt-en-${l.code}-ct2-int8`, sources: ["en"], targets: [l.code], sizeBytes: l.sizeBytes / 2, license: "CC-BY-4.0", attribution: "Helsinki-NLP / OPUS-MT" },
        { id: `opus-mt-${l.code}-en-ct2-int8`, sources: [l.code], targets: ["en"], sizeBytes: l.sizeBytes / 2, license: "CC-BY-4.0", attribution: "Helsinki-NLP / OPUS-MT" },
      ],
    })),
  ];
}

function detect(text: string): string | null {
  if (!/\p{L}/u.test(text)) return null;
  const have = ["en", ...installed()];
  const guess = /\b(der|die|das|und|ist|ich|hallo|wie|geht)\b/i.test(text) ? "de" : /[؀-ۿ]/.test(text) ? "ur" : "en";
  return have.includes(guess) ? guess : "en";
}

async function install(code: string) {
  if (downloading.has(code)) return;
  downloading.set(code, false);
  const entry = CATALOG.find((l) => l.code === code);
  const total = entry?.sizeBytes ?? 1;
  const progress = (phase: PackProgress["phase"], done = 0): PackProgress => ({ code, phase, done, total, errorCode: null, error: null });
  for (let done = 0; done <= total; done += total / 20) {
    if (downloading.get(code)) {
      downloading.delete(code);
      emit("pack-progress", progress("cancelled"));
      emit("packs-changed", null);
      return;
    }
    emit("pack-progress", progress("downloading", done));
    await sleep(150);
  }
  emit("pack-progress", progress("verifying"));
  await sleep(300);
  emit("pack-progress", progress("extracting"));
  await sleep(300);
  save("owll.installed", [...installed().filter((c) => c !== code), code]);
  downloading.delete(code);
  emit("pack-progress", progress("done", total));
  emit("packs-changed", null);
}

export async function mockInvoke<T>(cmd: string, a: Record<string, unknown> = {}): Promise<T> {
  const out = (v: unknown) => v as T;
  switch (cmd) {
    case "translate": {
      const have = ["en", ...installed()];
      for (const code of [a.from as string, a.to as string]) {
        if (!have.includes(code)) return fail("pack_missing", code);
      }
      const pivoted = a.from !== "en" && a.to !== "en" && a.from !== a.to;
      const sentences = (a.text as string).match(/[^.!?]+[.!?]*\s*/g) ?? [a.text as string];
      const id = a.requestId as number;
      // Mimic the backend: a quick draft in batches of 4, then the final pass.
      for (const pass of ["fast", "refine"] as const) {
        for (let done = 4; done - 4 < sentences.length; done += 4) {
          await sleep(120);
          const upTo = Math.min(done, sentences.length);
          const text = sentences.slice(0, upTo).map((x) => `[${a.to}${pass === "fast" ? " draft" : ""}] ${x.trim()}`).join(" ");
          emit("translate-progress", { requestId: id, text, pass, done: upTo, total: sentences.length, pivoted, draftShown: pass === "refine" });
        }
      }
      const parts = sentences.map((x) => `[${a.to}] ${x.trim()}`);
      let at = 0;
      const segments = sentences.map((x, i) => {
        const seg = { source: x.trim(), input: x.trim(), target: parts[i], start: at, end: at + parts[i].length, pinned: false };
        at += parts[i].length + 1;
        return seg;
      });
      return out({ text: parts.join(" "), pivoted, segments, glossaryHits: 0 } satisfies TranslateResult);
    }
    case "alternatives": {
      await sleep(150);
      return out([
        { word: "Current", text: "Mock sentence.", preview: "Current ...", current: true },
        { word: "Alternative", text: "Mock alternative sentence.", preview: "Alternative sentence. ...", current: false },
        { word: "Other", text: "Mock other sentence.", preview: "Other sentence. ...", current: false },
      ]);
    }
    case "pin_translation":
      return out(undefined);
    case "glossaries_get":
      return out({ lists: [{ id: "g1", name: "My glossary", from: null, to: null, entries: [] }] });
    case "glossaries_set":
      return out(a.glossaries);
    case "glossary_set_active":
      return out(undefined);
    case "glossary_export_csv":
      return out("source,target,from,to,match_case,whole_word,enabled\n");
    case "doc_inspect":
      return out({ path: a.path, name: String(a.path).split(/[\\/]/).pop(), kind: "docx", sizeBytes: 1234, detection: "ok", detected: "en", tooLarge: false });
    case "doc_default_output":
      return out(String(a.path).replace(/(\.[^.]+)$/, ` (${String(a.to).toUpperCase()})$1`));
    case "doc_translate":
    case "doc_cancel":
    case "doc_open":
    case "doc_show_in_folder": {
      return out(undefined);
    }
    case "detect_language": {
      const code = detect(a.text as string);
      return out(code ? { status: "ok", code } : { status: "none", code: null });
    }
    case "smart_target": {
      if (a.source !== a.target) return out(a.target);
      const last = (load<Partial<Settings>>("owll.settings", {}).lastForeignTarget as string) || "de";
      return out(a.source === "en" ? (last === "en" ? "de" : last) : "en");
    }
    case "ocr_image":
      return out({ text: "Mock recognized text", problem: null });
    case "ocr_status":
      return out({ languages: [{ code: "en", engine: "windows", tag: "en-US" }], windowsTags: ["en-US"] });
    case "capture_overlay_info":
    case "take_capture_result":
    case "ocr_capture_again":
      return out(null);
    case "capture_start":
    case "capture_cancel":
    case "capture_finish":
    case "capture_overlay_ready":
    case "open_windows_language_settings":
    case "set_maximize_rect":
    case "quick_replace":
      return out(undefined);
    case "list_languages":
      return out(languages());
    case "install_language":
      void install(a.code as string);
      return out(undefined);
    case "cancel_install":
      if (downloading.has(a.code as string)) downloading.set(a.code as string, true);
      return out(undefined);
    case "activate_language":
    case "activate_languages":
      return out(undefined);
    case "deactivate_language":
      save("owll.installed", installed().filter((c) => c !== a.code));
      emit("packs-changed", null);
      return out({ modelIds: [], freedBytes: 0 });
    case "delete_model_files":
      return out(0);
    case "take_activation_offer":
      return out(null);
    case "repair_language":
      save("owll.installed", installed().filter((c) => c !== a.code));
      void install(a.code as string);
      return out(undefined);
    case "get_settings":
      return out({ ...defaultSettings, ...load<Partial<Settings>>("owll.settings", {}) });
    case "set_settings": {
      const next = { ...defaultSettings, ...load<Partial<Settings>>("owll.settings", {}), ...(a.patch as object) };
      save("owll.settings", next);
      emit("settings-changed", next);
      return out(next);
    }
    case "history_list":
      return out(load<HistoryEntry[]>("owll.history", []));
    case "history_add": {
      const settings = { ...defaultSettings, ...load<Partial<Settings>>("owll.settings", {}) };
      if (!settings.keepHistory) return out(undefined);
      const list = load<HistoryEntry[]>("owll.history", []);
      const now = Date.now();
      const first = list[0];
      const source = a.source as string;
      if (first && first.to === a.to && now - first.createdAt < 60_000 && (source.startsWith(first.source) || first.source.startsWith(source))) {
        list.shift();
      }
      list.unshift({ id: now, from: a.from as string, to: a.to as string, source, result: a.result as string, createdAt: now });
      save("owll.history", list.slice(0, 500));
      emit("history-changed", null);
      return out(undefined);
    }
    case "history_delete":
      save("owll.history", load<HistoryEntry[]>("owll.history", []).filter((e) => e.id !== a.id));
      emit("history-changed", null);
      return out(undefined);
    case "history_clear":
      save("owll.history", []);
      emit("history-changed", null);
      return out(undefined);
    case "take_settings_page":
      return out(new URLSearchParams(location.search).get("page"));
    case "check_shortcut":
      return out({ valid: true, error: null, canonical: a.text as string, conflicts: [], warning: null });
    case "hotkey_status":
    case "quick_take":
    case "take_quick_text":
      return out(null);
    case "quick_hide":
    case "quick_set_pinned":
    case "quick_open_in_main":
    case "quick_block_app":
    case "trace":
    case "quit_app":
    case "close_action":
    case "open_settings":
    case "set_tray_language":
      return out(undefined);
    default:
      return fail("unknown", `mock: unknown command ${cmd}`);
  }
}

export async function mockListen<T>(event: string, handler: (payload: T) => void): Promise<() => void> {
  const listener = (e: Event) => handler((e as CustomEvent<T>).detail);
  bus.addEventListener(event, listener);
  return () => bus.removeEventListener(event, listener);
}
