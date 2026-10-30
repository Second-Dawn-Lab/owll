import { useSettings } from "@seconddawn/settings";
import { Switch } from "@seconddawn/ui";
import { useEffect, useState } from "react";
import { useT } from "../i18n";
import { ipc, type Glossaries } from "../ipc";
import { settingsStore } from "../settings/store";

/** Counts glossary changes, so a translation made with the old glossary is made again. */
export function useGlossaryVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const off = ipc.onGlossaryChanged(() => setVersion((v) => v + 1));
    return () => void off.then((fn) => fn());
  }, []);
  return version;
}

/**
 * A switch with the name of the glossary in use and a list to change it. The choice is the same one the
 * quick popup and documents use. "Manage glossaries" opens the Glossary page of the settings.
 */
export function GlossaryPicker() {
  const { t } = useT();
  const { settings } = useSettings(settingsStore);
  const [glossaries, setGlossaries] = useState<Glossaries>({ lists: [] });
  const version = useGlossaryVersion();
  useEffect(() => {
    void ipc.glossariesGet().then(setGlossaries);
  }, [version]);

  const active = glossaries.lists.find((l) => l.id === settings.glossaryActive);
  const on = !!active;
  // Switching on picks the last used list, or the first one; with no list at all it opens the settings.
  const toggle = (next: boolean) => {
    if (!next) return void ipc.glossarySetActive("");
    const target = glossaries.lists[0];
    if (target) void ipc.glossarySetActive(target.id);
    else void ipc.openSettings("glossary");
  };

  return (
    <div className="glosspick" title={t("gloss.pickerHint")}>
      <Switch label={t("gloss.pickerLabel")} checked={on} onChange={toggle} />
      <select
        value={active?.id ?? ""}
        aria-label={t("gloss.pickerLabel")}
        onChange={(e) => (e.target.value === "__manage" ? void ipc.openSettings("glossary") : void ipc.glossarySetActive(e.target.value))}
      >
        <option value="">{t("gloss.none")}</option>
        {glossaries.lists.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
        <option value="__manage">{t("gloss.manage")}</option>
      </select>
    </div>
  );
}
