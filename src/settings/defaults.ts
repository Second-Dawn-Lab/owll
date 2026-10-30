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
};
