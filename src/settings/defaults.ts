import type { Theme } from "@seconddawn/ui";

/** Mirrors `Settings` in src-tauri/src/settings.rs (the backend owns persistence). */
export interface Settings {
  launchAtStart: boolean;
  closeBehavior: "ask" | "background" | "quit";
  quickAccess: "popup" | "app";
  ignoreQuickAccessWithoutSelection: boolean;
  floatingIcon: boolean;
  translateShortcutEnabled: boolean;
  translateShortcut: string;
  captureShortcutEnabled: boolean;
  captureShortcut: string;
  theme: Theme;
  uiLanguage: "system" | "en" | "de";
  downloadLocation: string;
  keepHistory: boolean;
  captureLanguages: string[];
  blockList: string[];
  proxyEnabled: boolean;
  proxyUrl: string;
  /** CPU threads per translation model; 0 = automatic. */
  translationThreads: number;
  /** Show a quick draft first, then replace it with the better translation. */
  twoPass: boolean;
  sourceLanguage: string;
  targetLanguage: string;
  lastForeignTarget: string;
  /** Unix time (seconds) of the last update check; 0 = never. */
  lastUpdateCheck: number;
  /** The first-run welcome has been shown or skipped. */
  onboardingDone: boolean;
  /** Where an area capture shows its result. */
  captureResultIn: "main" | "popup";
  /** The glossary in use (id), "" for none. */
  glossaryActive: string;
  /** The last answer to the PDF question. */
  pdfOutput: "pdf" | "docx";
  /** Ask the PDF question before every batch with PDFs. */
  pdfAsk: boolean;
  /** The Files tab's own target language ("" = not chosen yet). */
  filesTargetLanguage: string;
  liveShortcutEnabled: boolean;
  liveShortcut: string;
  /** How often live captions look at the region. */
  liveSpeed: "calm" | "normal" | "fast";
  /** Translated lines the caption bar shows (1 to 3). */
  liveLines: number;
  /** Font size of the translation in the caption bar. */
  liveFontSize: number;
  /** Opacity of the bar's background (0.3 to 1). */
  liveOpacity: number;
  liveShowOriginal: boolean;
  /** What to do with the conversation when a live session ends. */
  liveSaveChoice: "ask" | "always" | "never";
  /** The size the user gave the caption bar (logical pixels, 0 = automatic). */
  liveBarWidth: number;
  liveBarHeight: number;
}

/** Used until the backend answers, and by the browser mock. Keep in sync with Rust. */
export const defaultSettings: Settings = {
  launchAtStart: false,
  closeBehavior: "ask",
  quickAccess: "popup",
  ignoreQuickAccessWithoutSelection: false,
  floatingIcon: false,
  translateShortcutEnabled: true,
  translateShortcut: "Ctrl+C C",
  captureShortcutEnabled: true,
  captureShortcut: "Ctrl+Shift+O",
  theme: "system",
  uiLanguage: "system",
  downloadLocation: "ask",
  keepHistory: true,
  captureLanguages: [],
  blockList: [],
  proxyEnabled: false,
  proxyUrl: "",
  translationThreads: 0,
  twoPass: false,
  sourceLanguage: "auto",
  targetLanguage: "de",
  lastForeignTarget: "de",
  lastUpdateCheck: 0,
  onboardingDone: false,
  captureResultIn: "main",
  glossaryActive: "",
  pdfOutput: "docx",
  pdfAsk: true,
  filesTargetLanguage: "",
  liveShortcutEnabled: true,
  liveShortcut: "Ctrl+Shift+L",
  liveSpeed: "normal",
  liveLines: 2,
  liveFontSize: 28,
  liveOpacity: 0.82,
  liveShowOriginal: false,
  liveSaveChoice: "ask",
  liveBarWidth: 0,
  liveBarHeight: 0,
};
