import { useSettings } from "@seconddawn/settings";
import { Switch } from "@seconddawn/ui";
import { useEffect, useState } from "react";
import { useT } from "../i18n";
import { ipc, type Glossaries } from "../ipc";
import { settingsStore } from "../settings/store";
import { Dropdown } from "./Dropdown";

/** Counts glossary changes, so a translation made with the old glossary is made again. */
export function useGlossaryVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const off = ipc.onGlossaryChanged(() => setVersion((v) => v + 1));
    return () => void off.then((fn) => fn());
  }, []);
  return version;
}

const MANAGE = "__manage";
const NONE = "";

/**
 * A compact switch with the name of the glossary in use as a small dropdown. The choice is the same one the
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
  // Switching on picks the first list; with no list at all it opens the settings.
  const toggle = (next: boolean) => {
    if (!next) return void ipc.glossarySetActive("");
    const target = glossaries.lists[0];
    if (target) void ipc.glossarySetActive(target.id);
    else void ipc.openSettings("glossary");
  };

  return (
    <div className="glosspick" title={t("gloss.pickerHint")}>
      <Switch label={t("gloss.pickerLabel")} checked={!!active} onChange={toggle} />
      <Dropdown
        compact
        align="end"
        label={t("gloss.pickerLabel")}
        value={active?.id ?? NONE}
        options={[
          { value: NONE, label: t("gloss.none") },
          ...glossaries.lists.map((l) => ({ value: l.id, label: l.name })),
          { value: MANAGE, label: t("gloss.manage"), separated: true },
        ]}
        onChange={(id) => (id === MANAGE ? void ipc.openSettings("glossary") : void ipc.glossarySetActive(id))}
      />
    </div>
  );
}
