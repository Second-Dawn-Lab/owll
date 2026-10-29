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
