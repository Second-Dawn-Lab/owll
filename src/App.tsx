import { I18nProvider, resolveLocale } from "@seconddawn/i18n";
import { useSettings } from "@seconddawn/settings";
import { applyTheme } from "@seconddawn/ui";
import { useEffect, useState } from "react";
import { CaptureOverlay } from "./components/CaptureOverlay";
import { MainWindow } from "./components/MainWindow";
import { QuickPopup } from "./components/QuickPopup";
import { LiveBar } from "./components/LiveBar";
import { PickerPage } from "./components/PickerPage";
import { SettingsWindow } from "./settings/SettingsWindow";
import { dictionaries, supportedLocales } from "./i18n";
import { ipc, windowLabel } from "./ipc";
import { isEditable, ShortcutRouter } from "./settings/shortcutRouter";
import { settingsStore } from "./settings/store";

const label = windowLabel();

export function App() {
  const { settings } = useSettings(settingsStore);
  const [ready, setReady] = useState(false);
  const locale = resolveLocale(settings.uiLanguage, supportedLocales);

  useEffect(() => {
    settingsStore.init().finally(() => setReady(true));
  }, []);

  useEffect(() => applyTheme(settings.theme), [settings.theme]);

  // Every Owl-L shortcut (quick access, capture, live captions) also works as a key press in Owl-L's own windows,
  // whatever has the focus (a text box, a button, nothing): the page catches it before the web view can use it for
  // something else and reports it to the backend, which runs each key press once even if the keyboard hook saw it too.
  // One router handles single and double presses alike. Not while the shortcut dialog records a new shortcut.
  useEffect(() => {
    if (label.startsWith("overlay-") || label === "picker") return;
    const router = new ShortcutRouter([
      { name: "translate", shortcut: settings.translateShortcut, enabled: settings.translateShortcutEnabled },
      { name: "capture", shortcut: settings.captureShortcut, enabled: settings.captureShortcutEnabled },
      { name: "live", shortcut: settings.liveShortcut, enabled: settings.liveShortcutEnabled },
    ]);
    const onKeyDown = (e: KeyboardEvent) => {
      if (document.querySelector(".shortcut-capture")) return;
      const fire = router.onKeyDown(
        { code: e.code, repeat: e.repeat, ctrlKey: e.ctrlKey, altKey: e.altKey, shiftKey: e.shiftKey, metaKey: e.metaKey, altGraph: e.getModifierState("AltGraph") },
        e.timeStamp,
        isEditable(document.activeElement),
      );
      if (!fire) return;
      if (fire.consume) {
        e.preventDefault();
        e.stopPropagation();
      }
      void ipc.shortcutFired(fire.name, fire.name === "translate" ? (window.getSelection()?.toString() ?? "") : undefined);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [
    settings.translateShortcut,
    settings.translateShortcutEnabled,
    settings.captureShortcut,
    settings.captureShortcutEnabled,
    settings.liveShortcut,
    settings.liveShortcutEnabled,
  ]);

  // The caption bar is transparent around its rounded surface: the page styles look at this.
  useEffect(() => {
    document.documentElement.dataset.window = label;
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    if (label === "main") void ipc.setTrayLanguage(locale);
  }, [locale]);

  return (
    <I18nProvider locale={locale} dictionaries={dictionaries}>
      {ready && (label === "settings" ? <SettingsWindow /> : label === "quick" ? <QuickPopup /> : label.startsWith("overlay-") ? <CaptureOverlay /> : label === "live" ? <LiveBar /> : label === "picker" ? <PickerPage /> : <MainWindow />)}
    </I18nProvider>
  );
}
