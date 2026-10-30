import { I18nProvider, resolveLocale } from "@seconddawn/i18n";
import { useSettings } from "@seconddawn/settings";
import { applyTheme } from "@seconddawn/ui";
import { useEffect, useState } from "react";
import { CaptureOverlay } from "./components/CaptureOverlay";
import { MainWindow } from "./components/MainWindow";
import { QuickPopup } from "./components/QuickPopup";
import { SettingsWindow } from "./settings/SettingsWindow";
import { dictionaries, supportedLocales } from "./i18n";
import { ipc, windowLabel } from "./ipc";
import { buildShortcut } from "./settings/ShortcutEditor";
import { sameCombo } from "./settings/shortcutMatch";
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

  // The capture shortcut also works as a key press in Owl-L's own windows, whatever has the focus (a text box,
  // a button, nothing): the page catches it before the web view can use it for something else, and starts the
  // same capture as the keyboard hook does (a second start while one runs is ignored by the backend).
  // Not in the settings window, where the shortcut dialog records new shortcuts.
  useEffect(() => {
    if (label !== "main" && label !== "quick") return;
    if (!settings.captureShortcutEnabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || !sameCombo(buildShortcut(e, false), settings.captureShortcut)) return;
      e.preventDefault();
      e.stopPropagation();
      void ipc.captureStart(true);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [settings.captureShortcutEnabled, settings.captureShortcut]);

  useEffect(() => {
    document.documentElement.lang = locale;
    if (label === "main") void ipc.setTrayLanguage(locale);
  }, [locale]);

  return (
    <I18nProvider locale={locale} dictionaries={dictionaries}>
      {ready && (label === "settings" ? <SettingsWindow /> : label === "quick" ? <QuickPopup /> : label.startsWith("overlay-") ? <CaptureOverlay /> : <MainWindow />)}
    </I18nProvider>
  );
}
